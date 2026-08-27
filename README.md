# Stock Market Analysis AI

An intelligent AI-powered stock market analysis assistant that provides real-time financial insights, company comparisons, and market data analysis.

![Home Screen](assets/images/home.png)
![Chat Interface](assets/images/chat.png)

## Features

- **Real-time Stock Analysis**: Get current stock prices and market data
- **Company Comparisons**: Compare multiple stocks side-by-side
- **Financial Statements**: Access balance sheets, income statements, and cash flow data
- **Conversational AI**: Chat interface for natural language queries
- **Chat History**: Save and manage conversation history
- **Modern UI**: Responsive design with togglable sidebar and smooth animations
- **Streaming Responses**: Real-time typewriter effect for AI responses
- **Data Persistence**: PostgreSQL backend for storing chat history

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stockmarketter

# API Keys (if using external services)
# TAVILY_API_KEY=your_tavily_api_key_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Prerequisites

- Python 3.11+
- PostgreSQL database
- Node.js 18+ (for frontend)
- UV package manager

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Stock-Marketter
```

### 2. Set Up Database

**Install PostgreSQL:**

**macOS:**

```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from [PostgreSQL official site](https://www.postgresql.org/download/windows/)

**Create Database:**

```bash
# Login to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE stockmarketter;
CREATE USER your_username WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE stockmarketter TO your_username;
\q
```

**Update your .env file with your database credentials:**

```env
DATABASE_URL=postgresql://your_username:your_password@localhost:5432/stockmarketter
```

### 3. Install Dependencies

```bash
# Install Python dependencies
uv sync

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 4. Configure Environment

Copy the example environment file and update it:

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 5. Start the Application

**Terminal 1 - Backend:**

```bash
uv run uvicorn app:app --reload
```

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

### 6. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Project Structure

```
Stock-Marketter/
├── agent/              # AI agent logic
│   ├── main.py         # Agent initialization and functions
│   ├── tools/          # Stock analysis tools
│   ├── services/       # LLM service
│   └── db/             # Database operations
├── frontend/           # Next.js frontend
│   ├── app/            # Main application
│   └── components/    # UI components
├── app.py              # FastAPI backend
└── .env                # Environment variables
```

## Usage

1. **Start a New Chat**: Click the "+ New Chat" button
2. **Ask Questions**: Type your stock market queries in the input field
3. **View History**: Select previous conversations from the sidebar
4. **Delete Chats**: Hover over a chat and click the delete icon
5. **Toggle Sidebar**: Use the hamburger menu to show/hide the sidebar

## Example Queries

- "What's the current price of AAPL?"
- "Compare Tesla vs Ford stock performance"
- "Show me Microsoft's latest earnings report"
- "What are the key financial ratios for Amazon?"

## Tech Stack

- **Backend**: FastAPI, Python, LangChain
- **Frontend**: Next.js, React, Tailwind CSS
- **Database**: PostgreSQL with pgvector
- **AI**: Claude API, LangGraph

## Development

### Running Tests

```bash
# Backend tests
uv run pytest

# Frontend tests
cd frontend
npm test
```

### Code Style

- Backend: Follow PEP 8 guidelines
- Frontend: ESLint and Prettier configured

## Troubleshooting

**Database Connection Issues**

- Ensure PostgreSQL is running
- Check DATABASE_URL in .env file
- Verify database credentials

**API Key Issues**

- Ensure API keys are set in .env
- Check API key validity and permissions

**Frontend Build Issues**

- Clear node_modules and reinstall
- Check Node.js version compatibility

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Support

For issues and questions, please open an issue on GitHub or contact the development team.
