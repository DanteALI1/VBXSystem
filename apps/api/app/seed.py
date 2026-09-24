from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Permission, Role, User

PERMISSIONS = [
    ("vuln:read", "Чтение уязвимостей"),
    ("vuln:sync", "Синхронизация баз"),
    ("users:read", "Просмотр пользователей"),
    ("users:write", "Управление пользователями"),
    ("users:approve", "Подтверждение регистрации"),
    ("settings:read", "Чтение настроек"),
    ("settings:write", "Изменение настроек"),
    ("tickets:read", "Чтение заявок"),
    ("tickets:write", "Работа с заявками"),
    ("tickets:manage", "Управление заявками"),
    ("audit:read", "Просмотр аудита"),
    ("api_keys:manage", "Управление API-ключами"),
]

ROLES = {
    "super_admin": {
        "name": "Главный администратор",
        "description": "Полный доступ",
        "permissions": [p[0] for p in PERMISSIONS],
    },
    "admin": {
        "name": "Администратор",
        "description": "Администрирование без части супер-прав",
        "permissions": [
            "vuln:read",
            "vuln:sync",
            "users:read",
            "settings:read",
            "settings:write",
            "tickets:read",
            "tickets:write",
            "tickets:manage",
            "audit:read",
            "api_keys:manage",
        ],
    },
    "analyst": {
        "name": "Аналитик",
        "description": "Поиск, карточки, заявки",
        "permissions": ["vuln:read", "tickets:read", "tickets:write", "settings:read"],
    },
    "viewer": {
        "name": "Наблюдатель",
        "description": "Только чтение",
        "permissions": ["vuln:read", "tickets:read", "settings:read"],
    },
    "ticket_manager": {
        "name": "Менеджер заявок",
        "description": "Полное управление заявками",
        "permissions": ["vuln:read", "tickets:read", "tickets:write", "tickets:manage"],
    },
}


def seed_rbac(db: Session) -> None:
    perm_by_code: dict[str, Permission] = {}
    for code, name in PERMISSIONS:
        existing = db.query(Permission).filter_by(code=code).one_or_none()
        if existing:
            perm_by_code[code] = existing
        else:
            p = Permission(code=code, name=name, description=name)
            db.add(p)
            db.flush()
            perm_by_code[code] = p

    for code, meta in ROLES.items():
        role = db.query(Role).filter_by(code=code).one_or_none()
        if not role:
            role = Role(code=code, name=meta["name"], description=meta["description"])
            db.add(role)
            db.flush()
        role.permissions = [perm_by_code[c] for c in meta["permissions"] if c in perm_by_code]

    db.commit()


def seed_admin(db: Session) -> User:
    settings = get_settings()
    user = db.query(User).filter_by(username=settings.vbx_admin_username).one_or_none()
    role = db.query(Role).filter_by(code="super_admin").one()
    if user:
        if role not in user.roles:
            user.roles.append(role)
        user.is_super_admin = True
        user.status = "active"
        db.commit()
        return user

    user = User(
        username=settings.vbx_admin_username,
        email=settings.vbx_admin_email,
        password_hash=hash_password(settings.vbx_admin_password),
        full_name=settings.vbx_admin_full_name,
        organization=settings.vbx_admin_org,
        title=settings.vbx_admin_title,
        phone=settings.vbx_admin_phone,
        status="active",
        is_super_admin=True,
    )
    user.roles.append(role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def run_seed(db: Session) -> None:
    seed_rbac(db)
    seed_admin(db)
    seed_demo_intel_if_empty(db)


SAMPLE_BDU_XML = """<?xml version="1.0" encoding="UTF-8"?>
<vulnerabilities>
  <vulnerability>
    <identifier>BDU:2024-00001</identifier>
    <name>Уязвимость ExampleSoft RCE</name>
    <description>Тестовая запись БДУ с привязкой к CVE-2024-0001</description>
    <severity>Критический</severity>
    <severity_level>4</severity_level>
    <status>Подтверждена</status>
    <solution>Обновить ExampleSoft</solution>
    <vendor>ExampleSoft</vendor>
    <software>ExampleSoft 1.0</software>
    <cwe>CWE-94</cwe>
    <cve>CVE-2024-0001</cve>
    <identify_date>2024-02-01</identify_date>
  </vulnerability>
  <vulnerability>
    <identifier>BDU:2024-00002</identifier>
    <name>Локальная уязвимость без CVE</name>
    <description>Запись БДУ без привязки к CVE — должна стать standalone карточкой</description>
    <severity>Средний</severity>
    <severity_level>2</severity_level>
    <status>Подтверждена</status>
    <solution>Ограничить доступ</solution>
    <vendor>LocalVendor</vendor>
    <software>LocalApp</software>
    <identify_date>2024-03-01</identify_date>
  </vulnerability>
</vulnerabilities>
"""


def seed_demo_intel_if_empty(db: Session) -> None:
    """On first boot with empty CVE table, load mock NVD/BDU/KEV/EPSS for demos & E2E."""
    from sqlalchemy import func

    from app.models import CveRecord
    from app.services.auth_helpers import get_setting, set_setting
    from app.services.bdu_import import import_bdu_xml_content
    from app.services.epss_sync import seed_mock_epss
    from app.services.kev_sync import seed_mock_kev
    from app.services.nvd_sync import seed_mock_cves

    count = db.query(func.count(CveRecord.id)).scalar() or 0
    if count > 0:
        return

    # Default mock mode when no NVD key configured yet
    if not get_setting(db, "nvd_mock_mode", ""):
        set_setting(db, "nvd_mock_mode", "true")

    seed_mock_cves(db)
    seed_mock_kev(db)
    import_bdu_xml_content(db, SAMPLE_BDU_XML)
    seed_mock_epss(db)
    try:
        from app.services.xdb import seed_sample_exploits

        seed_sample_exploits(db)
    except Exception as exc:  # pragma: no cover
        print(f"[vbx-seed] xdb sample skipped: {exc}")
