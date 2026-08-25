from dataclasses import dataclass
from typing import Literal, cast
from pydantic import SecretStr
from dotenv import load_dotenv
import os

load_dotenv()

LLMProvider = Literal["bedrock", "openai", "anthropic", "groq"]

aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")


@dataclass
class LLMConfig:
    model_name: str = os.getenv(
        "MODEL_NAME",
        "openai.gpt-oss-20b-1:0"
    )

    temperature: float = 0.0

    region_name: str = os.getenv(
        "AWS_REGION",
        "ap-south-1"
    )

    aws_access_key_id: SecretStr | None = (
        SecretStr(aws_access_key)
        if aws_access_key is not None
        else None
    )

    aws_secret_access_key: SecretStr | None = (
        SecretStr(aws_secret_access_key)
        if aws_secret_access_key is not None
        else None
    )

    llm_provider: LLMProvider = cast(
        LLMProvider,
        os.getenv("PROVIDER", "bedrock")
    )