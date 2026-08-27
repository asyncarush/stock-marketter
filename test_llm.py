
from langchain_litellm import ChatLiteLLMRouter
from langchain_core.language_models import BaseChatModel
from dataclasses import dataclass
from litellm import Router
from typing import Optional


@dataclass
class LLMModelConfig:
    model_id: str
    model_name: str
    temperature: Optional[float] = 0.0


@dataclass
class LLMConfig:
    llm_provider: str
    models: list[LLMModelConfig]
    fallbacks: list[dict[str, list[str]]]



LLM_CONFIG = LLMConfig(
    llm_provider="bedrock",
    models=[
        LLMModelConfig(
            model_id="bedrock/moonshotai.kimi-k2.5",
            model_name="primary-model"
        ),
        LLMModelConfig(
            model_id="bedrock/qwen.qwen3-vl-235b-a22b",
            model_name="secondary-model"
        )
    ],
    fallbacks=[{ "primary-model" : ["secondary-model"]}]
)

class LLMService:

    def __init__(self, config: LLMConfig):
        self.config = config
        self.client = self._create_client()
        self.router = None

    def _create_client(self) -> BaseChatModel:

        if self.config.llm_provider == "bedrock":
            self.router = self._create_router()

            return ChatLiteLLMRouter(
                router=self.router,
                model_name="primary-model"
            )

        elif self.config.llm_provider == "groq":
            pass


    def _create_router(self) -> Router:

        model_list = []

        for model in self.config.models:
            model_list.append({
                "model_name": model.model_name,
                "litellm_params": {
                    "model": model.model_id,
                },
            })


        return Router(model_list=model_list, fallbacks=self.config.fallbacks)


    def get_client(self) -> BaseChatModel:
        return self.client


LLM_SERVICE = LLMService(LLM_CONFIG)
llm = LLM_SERVICE.get_client()
result = llm.invoke("hi")
print(result)