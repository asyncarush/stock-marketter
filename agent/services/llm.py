from agent.config import LLMConfig, AWS_BEDROCK_CONFIG, GROQ_CONFIG
from langchain_litellm import ChatLiteLLMRouter
from langchain_core.language_models import BaseChatModel
from dataclasses import dataclass
from litellm import Router


class LLMService:

    def __init__(self, config: LLMConfig):
        self.config = config
        self.client = self._create_client()
        self.router = None

    def _create_client(self) -> BaseChatModel:

        if self.config.llm_provider == "bedrock":
            self.router = self._create_router(config=AWS_BEDROCK_CONFIG())

            return ChatLiteLLMRouter(
                router=self.router,
                model_name="primary-model"
            )

        elif self.config.llm_provider == "groq":
            self.router = self._create_router(config=GROQ_CONFIG())

            return ChatLiteLLMRouter(
                router=self.router,
                model_name="primary-model"
            )


    def _create_router(self, config) -> Router:

        model_list = []

        for model in config.models:
            model_list.append({
                "model_name": model.model_name,
                "litellm_params": {
                    "model": model.model_id,
                },
            })


        return Router(model_list=model_list, fallbacks=config.fallbacks, routing_strategy="least-busy")


    def get_client(self) -> BaseChatModel:
        return self.client