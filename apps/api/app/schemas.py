from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str = "vbx-api"


class ReadyResponse(BaseModel):
    status: str
    database: bool
    redis: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    device_label: str = ""


class LoginResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    requires_2fa: bool = False
    temp_token: str | None = None
    is_new_device: bool = False


class TwoFAVerifyRequest(BaseModel):
    temp_token: str
    code: str = Field(min_length=4, max_length=32)
    device_label: str = ""


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = ""
    organization: str = ""
    title: str = ""
    phone: str = ""


class MessageOut(BaseModel):
    message: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    organization: str
    title: str
    phone: str
    status: str
    is_super_admin: bool
    totp_enabled: bool
    roles: list[str]
    groups: list[str] = []

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    organization: str | None = None
    title: str | None = None
    phone: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_url: str
    qr_png_base64: str


class TotpEnableRequest(BaseModel):
    code: str


class TotpEnableOut(BaseModel):
    recovery_codes: list[str]
    message: str


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = ""
    organization: str = ""
    title: str = ""
    phone: str = ""
    roles: list[str] = ["viewer"]
    status: str = "active"


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    email: str | None = None
    organization: str | None = None
    title: str | None = None
    phone: str | None = None
    status: str | None = None
    roles: list[str] | None = None
    group_ids: list[int] | None = None


class GroupOut(BaseModel):
    id: int
    name: str
    source: str
    external_id: str | None
    description: str

    model_config = {"from_attributes": True}


class GroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    source: str = "local"
    external_id: str | None = None


class AdGroupSyncRequest(BaseModel):
    """Contract for future LDAP sync (W6)."""

    dry_run: bool = True
    ou_filter: str | None = None


class AdGroupSyncOut(BaseModel):
    status: str
    message: str
    planned: list[dict] = []


class RoleOut(BaseModel):
    code: str
    name: str
    description: str
