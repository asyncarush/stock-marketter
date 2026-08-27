# Stock Marketter 📈

An AI-powered stock market analysis assistant that gives you real-time financial insights, company comparisons, and market data — all through a simple chat interface.

---

![Home Screen](assets/images/home.png)
![Chat Interface](assets/images/chat.png)

## ✨ Features

- **Real-time Stock Analysis** — Get current stock prices and market data
- **Company Comparisons** — Compare multiple stocks side-by-side
- **Financial Statements** — Access balance sheets, income statements, and cash flow data
- **Conversational AI** — Ask questions in plain English
- **Chat History** — Save and revisit past conversations
- **Modern UI** — Responsive design with a togglable sidebar and smooth animations
- **Streaming Responses** — Typewriter-style live responses
- **Data Persistence** — PostgreSQL backend for storing chat history

---

## 🛠 Tech Stack

| Layer                     | Technology                            |
| ------------------------- | ------------------------------------- |
| Backend                   | FastAPI, Python, LangChain, LangGraph |
| Frontend                  | Next.js, React, Tailwind CSS          |
| Database                  | PostgreSQL with pgvector              |
| AI                        | Claude API                            |
| Package Manager (backend) | UV                                    |

---

## 🚀 Setup Guide

This guide assumes zero prior setup — just follow each step in order.

### Step 1: Clone the project & set up environment variables

```bash
cp .env.example .env
```

Open the new `.env` file and fill in your values (API keys, database URL, etc).

---

### Step 2: Install UV (Python package manager)

If you don't have UV installed yet:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Then install all backend dependencies:

```bash
uv sync
```

---

### Step 3: Set up PostgreSQL with pgvector

You need PostgreSQL installed with the `pgvector` extension enabled.

**macOS:**

```bash
brew install postgresql@15
brew install pgvector
brew services start postgresql@15
```

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo apt install postgresql-15-pgvector
sudo systemctl start postgresql
```

**Windows:**
Download PostgreSQL from the [official site](https://www.postgresql.org/download/windows/) and install the `pgvector` extension separately.

**Create your database:**

```bash
psql -U postgres
```

Then inside the `psql` prompt:

```sql
CREATE DATABASE stockmarketter;
\c stockmarketter
CREATE EXTENSION vector;
```

**Update your `.env` file** with your database connection string:

```env
DATABASE_URL=postgresql://your_username:your_password@localhost:5432/stockmarketter
```

---

### Step 4: Start the Backend

```bash
uv run uvicorn app:app --reload
```

Your backend will run at **http://localhost:8000**

---

### Step 5: Start the Frontend

Open a new terminal window:

```bash
cd frontend
npm install
npm run dev
```

Your frontend will run at **http://localhost:3000**

---

### Step 6: Open the App

| Service           | URL                        |
| ----------------- | -------------------------- |
| Frontend          | http://localhost:3000      |
| Backend API       | http://localhost:8000      |
| API Documentation | http://localhost:8000/docs |

---

## 💬 How to Use

1. **Start a New Chat** — Click the "+ New Chat" button
2. **Ask a Question** — Type your stock market query into the input field
3. **View History** — Select any previous conversation from the sidebar
4. **Delete a Chat** — Hover over a chat and click the delete icon
5. **Toggle Sidebar** — Use the hamburger menu to show or hide it

---

## 💡 Example Queries

- "What's the current price of AAPL?"
- "Compare Tesla vs Ford stock performance"
- "Show me Microsoft's latest earnings report"
- "What are the key financial ratios for Amazon?"

---

## 📄 License

MIT License
