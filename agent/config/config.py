from typing import Literal, cast, Optional
from dataclasses import dataclass, field
from pydantic import SecretStr
from dotenv import load_dotenv
import os

load_dotenv()

LLMProvider = Literal[
    "bedrock",
    "openai",
    "anthropic",
    "groq",
]


aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")


@dataclass
class LLMModelConfig:
    model_id: str
    model_name: str
    temperature: Optional[float] = 0.0
    tags: Optional[list[str]] = field(default_factory=list)


@dataclass
class LLMConfig:

    llm_provider: LLMProvider = cast(
        LLMProvider,
        os.getenv("PROVIDER", "bedrock"),
    )

    models: list[LLMModelConfig] = field(
        default_factory=lambda: [
            LLMModelConfig(
                model_id="bedrock/moonshotai.kimi-k2.5",
                model_name="primary-model",
                tags=["faster-cheaper"]
            ),
            LLMModelConfig(
                model_id="bedrock/qwen.qwen3-vl-235b-a22b",
                model_name="secondary-model",
                tags=["slower-better"]
            ),
        ]
    )

    fallbacks: list[dict[str, list[str]]] = field(
        default_factory=lambda: [
            {
                "primary-model": ["secondary-model"]
            }
        ]
    )

    region_name: str = os.getenv(
        "AWS_REGION",
        "ap-south-1",
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