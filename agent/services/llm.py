from agent.config import LLMConfig
from langchain_litellm import ChatLiteLLM
from langchain_core.language_models import BaseChatModel

class LLMService:

    def __init__(self, config: LLMConfig):
        self.config = config
        self.client = self._create_client()

    def _create_client(self) -> BaseChatModel:
        if self.config.llm_provider == "bedrock":
            model = f"bedrock/{self.config.model_name}"

        elif self.config.llm_provider == "openai":
            model = f"openai/{self.config.model_name}"

        elif self.config.llm_provider == "groq":
            model = f"groq/{self.config.model_name}"

        elif self.config.llm_provider == "anthropic":
            model = f"anthropic/{self.config.model_name}"

        else:
            raise ValueError(
                f"Unsupported LLM provider: {self.config.llm_provider}"
            )

        return ChatLiteLLM(
            model=model,
            temperature=self.config.temperature,
        )

    def get_client(self) -> BaseChatModel:
        return self.client