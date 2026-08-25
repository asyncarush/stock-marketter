import os
from dotenv import load_dotenv
from tavily.tavily import TavilyClient

load_dotenv()

api_key = os.getenv("TAVILY_API_KEY")

print("API key exists:", bool(api_key))

client = TavilyClient(api_key=api_key)

result = client.search(
    query="Apple latest news",
    search_depth="fast",
    max_results=3,
)

print(result)