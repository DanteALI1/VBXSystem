"""CVEQL subset parser: tokenize → AST. No SQL strings built from user input."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class CveqlParseError(ValueError):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


ALLOWED_FIELDS = {
    "id": "id",
    "severity": "severity",
    "cvss_score": "cvss_score",
    "published": "published",
    "description": "description",
    "is_cisa_kev": "is_cisa_kev",
    "has_bdu": "has_bdu",
    "products.vendor.name": "products_vendor",
    "epss_scores.score": "epss_score",
    "bdu.id": "bdu_id",
}

OPS = {"=", "!=", ">", ">=", "<", "<=", "~", "in"}


@dataclass
class Cmp:
    field: str
    op: str
    value: Any


@dataclass
class And:
    left: Any
    right: Any


@dataclass
class Or:
    left: Any
    right: Any


def _tokenize(q: str) -> list[str]:
    tokens: list[str] = []
    i = 0
    n = len(q)
    while i < n:
        c = q[i]
        if c.isspace():
            i += 1
            continue
        if c in "(),":
            tokens.append(c)
            i += 1
            continue
        if c in "\"'":
            quote = c
            i += 1
            buf = []
            while i < n and q[i] != quote:
                if q[i] == "\\" and i + 1 < n:
                    buf.append(q[i + 1])
                    i += 2
                    continue
                buf.append(q[i])
                i += 1
            if i >= n:
                raise CveqlParseError("Незакрытая строка в кавычках")
            i += 1
            tokens.append('"' + "".join(buf) + '"')
            continue
        if c in "=!><~":
            if i + 1 < n and q[i : i + 2] in ("!=", ">=", "<="):
                tokens.append(q[i : i + 2])
                i += 2
            else:
                tokens.append(c)
                i += 1
            continue
        # word / number / dotted field / comma list start
        j = i
        while j < n and (q[j].isalnum() or q[j] in "._-:%"):
            j += 1
        if j == i:
            raise CveqlParseError(f"Неожиданный символ «{c}» на позиции {i}")
        tokens.append(q[i:j])
        i = j
    return tokens


class _Parser:
    def __init__(self, tokens: list[str]):
        self.tokens = tokens
        self.pos = 0

    def peek(self) -> str | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def eat(self, expected: str | None = None) -> str:
        tok = self.peek()
        if tok is None:
            raise CveqlParseError("Неожиданный конец запроса")
        if expected is not None and tok.lower() != expected.lower():
            raise CveqlParseError(f"Ожидалось «{expected}», получено «{tok}»")
        self.pos += 1
        return tok

    def parse(self) -> Any:
        if not self.tokens:
            raise CveqlParseError("Пустой запрос")
        node = self.parse_or()
        if self.peek() is not None:
            raise CveqlParseError(f"Лишние токены после выражения: {self.peek()}")
        return node

    def parse_or(self) -> Any:
        left = self.parse_and()
        while self.peek() and self.peek().lower() == "or":
            self.eat("or")
            right = self.parse_and()
            left = Or(left, right)
        return left

    def parse_and(self) -> Any:
        left = self.parse_primary()
        while self.peek() and self.peek().lower() == "and":
            self.eat("and")
            right = self.parse_primary()
            left = And(left, right)
        return left

    def parse_primary(self) -> Any:
        if self.peek() == "(":
            self.eat("(")
            node = self.parse_or()
            self.eat(")")
            return node
        return self.parse_cmp()

    def parse_cmp(self) -> Cmp:
        field_tok = self.eat()
        field_key = field_tok.lower() if field_tok.lower() in ALLOWED_FIELDS else field_tok
        # allow case-sensitive dotted names as typed
        if field_tok in ALLOWED_FIELDS:
            field = field_tok
        elif field_tok.lower() in {k.lower(): k for k in ALLOWED_FIELDS}:
            field = {k.lower(): k for k in ALLOWED_FIELDS}[field_tok.lower()]
        else:
            raise CveqlParseError(
                f"Неизвестное поле «{field_tok}». Допустимы: {', '.join(sorted(ALLOWED_FIELDS))}"
            )

        op = self.eat()
        op_l = op.lower()
        if op_l not in OPS:
            raise CveqlParseError(f"Неизвестный оператор «{op}». Допустимы: {', '.join(sorted(OPS))}")

        if op_l == "in":
            value = self.parse_list()
        else:
            value = self.parse_value()
        return Cmp(field=field, op=op_l, value=value)

    def parse_value(self) -> Any:
        tok = self.eat()
        low = tok.lower()
        if tok.startswith('"') and tok.endswith('"'):
            return tok[1:-1]
        if low in ("true", "false"):
            return low == "true"
        if low == "null":
            return None
        try:
            if "." in tok:
                return float(tok)
            return int(tok)
        except ValueError:
            # bareword string
            return tok

    def parse_list(self) -> list:
        if self.peek() != "(":
            raise CveqlParseError("После in ожидается список в скобках, например in (\"A\", \"B\")")
        self.eat("(")
        items = []
        if self.peek() == ")":
            self.eat(")")
            return items
        while True:
            items.append(self.parse_value())
            if self.peek() == ",":
                self.eat(",")
                continue
            break
        self.eat(")")
        return items


def parse_cveql(query: str) -> Any:
    q = (query or "").strip()
    if not q:
        raise CveqlParseError("Введите CVEQL-запрос")
    # strip trailing semicolon
    if q.endswith(";"):
        q = q[:-1].strip()
    tokens = _tokenize(q)
    # reject classic injection markers early
    joined = " ".join(tokens).lower()
    for bad in ("union", "select", "drop", "insert", "update", "delete", ";", "--", "/*"):
        if bad in joined and bad not in ("--",):  # -- already stripped as tokens? 
            # only reject if appears as standalone token-ish
            pass
    for t in tokens:
        tl = t.lower()
        if tl in {"union", "select", "drop", "insert", "update", "delete", "alter", "exec"}:
            raise CveqlParseError("Запрещённый фрагмент в запросе")
        if "--" in t or "/*" in t or ";" in t:
            raise CveqlParseError("Запрещённый фрагмент в запросе")
    return _Parser(tokens).parse()
