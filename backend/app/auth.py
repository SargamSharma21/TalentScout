import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .database import Base, engine, get_db


SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-development-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    company_name: Mapped[str] = mapped_column(String(200))


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    company_name: str = Field(min_length=1, max_length=200)


class UserLogin(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class UserProfile(BaseModel):
    id: int
    email: str
    full_name: str
    company_name: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


def create_access_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expires_at}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), database: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise credentials_error
    except (JWTError, ValueError) as error:
        raise credentials_error from error

    user = database.get(User, int(user_id))
    if user is None:
        raise credentials_error
    return user


@router.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserCreate, database: Session = Depends(get_db)) -> TokenResponse:
    email = user_data.email.strip().lower()
    existing_user = database.scalar(select(User).where(User.email == email))
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = User(
        email=email,
        hashed_password=password_context.hash(user_data.password),
        full_name=user_data.full_name.strip(),
        company_name=user_data.company_name.strip(),
    )
    database.add(user)
    database.commit()
    database.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id), user=user)


@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin, database: Session = Depends(get_db)) -> TokenResponse:
    email = user_data.email.strip().lower()
    user = database.scalar(select(User).where(User.email == email))
    if user is None or not password_context.verify(user_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    return TokenResponse(access_token=create_access_token(user.id), user=user)


@router.get("/me", response_model=UserProfile)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
