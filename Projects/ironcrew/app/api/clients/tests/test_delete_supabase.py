import requests
from supabase import create_client, Client

# 1. Supabase Configurations (from your Supabase Dashboard)
SUPABASE_URL = "https://cmgyrukizmczrrkqqqqq.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3lydWtpem1jenJya3FxcXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzAyNzcsImV4cCI6MjEwNTIwNjI3N30.vqYUYIe7XtdLBnvG6STe5zy-bcPHC_GRTK4qu88ysJk"

# 2. Next.js App Configurations
NEXTJS_API_URL = "http://localhost:3000/api/clients"

def test_delete_client_api():
    # Initialize the Supabase Client in Python
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    # Sign in a test user to get a valid JWT token
    print("Logging into Supabase via Python...")
    auth_response = supabase.auth.sign_in_with_password({
        "email": "hitesh.ironcrew@gmail.com",
        "password": "Hitesh@123"
    })
    
    # Extract the access token (JWT)
    access_token = auth_response.session.access_token
    print("Successfully logged in! Access token generated.")

    # 3. Formulate the request to your Next.js API
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Optional payload if testing a POST/PUT request
    payload = {
        "first_name": "Test Client"
    }
    
    print(f"\nSending authenticated request to Next.js API: {NEXTJS_API_URL}")
    print(NEXTJS_API_URL)
    response = requests.delete(NEXTJS_API_URL, json=payload, headers=headers)
    
    print(f"Next.js API Status Code: {response.status_code}")
    try:
        print("Next.js API Response JSON:", response.json())
    except Exception:
        print("Next.js API Response Text:", response.text)

if __name__ == "__main__":
    test_delete_client_api()

