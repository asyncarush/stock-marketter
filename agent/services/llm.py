from langchain_aws import ChatBedrockConverse
from langchain_core.language_models import BaseChatModel

from agent.config import LLMConfig

class LLMService:
    def __init__(self, config: LLMConfig):
        self.config = config
        self.llm_provider = config.llm_provider
        self.client = self._create_client()


    def _create_client(self) -> BaseChatModel:
        if self.llm_provider == "bedrock":
            return ChatBedrockConverse(
                model=self.config.model_name,
                region_name=self.config.region_name,
                aws_access_key_id=self.config.aws_access_key_id,
                aws_secret_access_key=self.config.aws_secret_access_key,
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {self.llm_provider}")

        if self.llm_provider == "groq":
            # Placeholder for Groq client initialization
            pass

        if self.llm_provider == "openai":
            # Placeholder for OpenAI client initialization
            pass

        if self.llm_provider == "anthropic":
            # Placeholder for Anthropic client initialization
            pass

    def get_client(self):
        return self.client