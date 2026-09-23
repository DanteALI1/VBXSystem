from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    full_name: str
    organization: str
    title: str
    phone: str
    status: str
    is_super_admin: bool
    totp_enabled: bool
    roles: list[str]

    model_config = {"from_attributes": True}


class HealthResponse(BaseModel):
    status: str
    service: str = "vbx-api"


class ReadyResponse(BaseModel):
    status: str
    database: bool
    redis: bool
