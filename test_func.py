from agent.tools.stock_data import get_stock_quote, get_company_overview, get_balance_sheet, get_income_statement, get_cash_flow
 
# Test the functions
print("Testing stock data functions...")
 
# Test get_stock_quote
result = get_income_statement("ADANIENSOL.NS")
print(f"Income Statement: {result}")

