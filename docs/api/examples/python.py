"""
AGI Workforce API - Python Examples
Demonstrates common API operations using Python requests library

Installation:
    pip install requests
"""

import requests
import time
import json
import uuid
from typing import Dict, List, Optional, Generator
from dataclasses import dataclass


BASE_URL = "https://agiworkforce.com/api"
TOKEN = "YOUR_JWT_TOKEN_HERE"


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class Message:
    """Chat message"""
    role: str
    content: str


@dataclass
class CreditBalance:
    """Credit balance information"""
    credits_remaining_cents: int
    credits_allocated_cents: int
    credits_used_cents: int
    daily_limit_cents: int
    daily_used_cents: int
    daily_remaining_cents: int
    period_start: str
    period_end: str


# ============================================================================
# API Client
# ============================================================================

class AGIWorkforceClient:
    """AGI Workforce API client with error handling and rate limiting"""

    def __init__(self, token: str, base_url: str = BASE_URL):
        self.token = token
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        })

    def _log_rate_limit(self, response: requests.Response):
        """Log rate limit information"""
        print(f"Rate Limit: "
              f"{response.headers.get('X-RateLimit-Remaining', '?')}/"
              f"{response.headers.get('X-RateLimit-Limit', '?')} remaining")

    def _handle_error(self, response: requests.Response):
        """Handle API errors"""
        try:
            error_data = response.json()
            error = error_data.get('error', {})
            raise APIError(
                error.get('message', 'Unknown error'),
                response.status_code,
                error.get('code')
            )
        except ValueError:
            raise APIError(response.text, response.status_code)

    def request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict:
        """Make an API request"""
        url = f"{self.base_url}{endpoint}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params
            )

            self._log_rate_limit(response)

            if not response.ok:
                if response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 60))
                    raise RateLimitError(
                        "Rate limit exceeded",
                        retry_after
                    )
                self._handle_error(response)

            return response.json()

        except requests.RequestException as e:
            raise APIError(f"Network error: {str(e)}", 0)

    def get(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """GET request"""
        return self.request('GET', endpoint, params=params)

    def post(self, endpoint: str, data: Optional[Dict] = None) -> Dict:
        """POST request"""
        return self.request('POST', endpoint, data=data)

    def delete(self, endpoint: str) -> Dict:
        """DELETE request"""
        return self.request('DELETE', endpoint)


# ============================================================================
# User Management
# ============================================================================

def get_current_user(client: AGIWorkforceClient) -> Dict:
    """Get current user profile"""
    print("🔍 Getting current user...")
    user = client.get('/me')
    print(f"User: {user['email']} (Plan: {user['plan']['tier']})")
    return user


# ============================================================================
# LLM API
# ============================================================================

def get_credit_balance(client: AGIWorkforceClient) -> CreditBalance:
    """Get credit balance"""
    print("💰 Getting credit balance...")
    data = client.get('/llm/v1/credits/balance')
    balance = CreditBalance(**data)
    print(f"Balance: ${balance.credits_remaining_cents / 100:.2f} remaining")
    return balance


def list_models(client: AGIWorkforceClient) -> List[Dict]:
    """List available models"""
    print("📋 Listing available models...")
    response = client.get('/llm/v1/models')
    models = response['data']
    print(f"Found {len(models)} models")
    return models


def create_chat_completion(
    client: AGIWorkforceClient,
    messages: List[Message],
    model: str = "gpt-4",
    temperature: float = 0.7,
    max_tokens: int = 1000,
    use_prompt_cache: bool = False
) -> Dict:
    """Create a chat completion"""
    print("💬 Creating chat completion...")

    data = {
        'model': model,
        'messages': [{'role': m.role, 'content': m.content} for m in messages],
        'temperature': temperature,
        'max_tokens': max_tokens,
        'use_prompt_cache': use_prompt_cache
    }

    response = client.post('/llm/v1/chat/completions', data)
    print(f"Completion: {response['usage']['total_tokens']} tokens used")
    return response


def stream_chat_completion(
    client: AGIWorkforceClient,
    messages: List[Message],
    model: str = "gpt-4",
    temperature: float = 0.7,
    max_tokens: int = 1000
) -> Generator[str, None, None]:
    """Stream a chat completion"""
    print("🌊 Streaming chat completion...")

    data = {
        'model': model,
        'messages': [{'role': m.role, 'content': m.content} for m in messages],
        'temperature': temperature,
        'max_tokens': max_tokens,
        'stream': True
    }

    url = f"{client.base_url}/llm/v1/chat/completions"
    headers = {
        'Authorization': f'Bearer {client.token}',
        'Content-Type': 'application/json'
    }

    with requests.post(url, json=data, headers=headers, stream=True) as response:
        response.raise_for_status()

        for line in response.iter_lines():
            if line:
                line_text = line.decode('utf-8')
                if line_text.startswith('data: '):
                    data_text = line_text[6:]
                    if data_text == '[DONE]':
                        break

                    try:
                        chunk = json.loads(data_text)
                        content = chunk['choices'][0]['delta'].get('content')
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError):
                        continue


# ============================================================================
# Device Management
# ============================================================================

def generate_device_link_code(
    device_name: str,
    device_type: str = "desktop"
) -> Dict:
    """Generate device link code (no auth required)"""
    print("🔗 Generating device link code...")

    device_id = str(uuid.uuid4())
    data = {
        'device_id': device_id,
        'device_name': device_name,
        'device_type': device_type
    }

    response = requests.post(
        f"{BASE_URL}/device/link",
        json=data,
        headers={'Content-Type': 'application/json'}
    )

    response.raise_for_status()
    result = response.json()

    print(f"Link Code: {result['link_code']}")
    print(f"Verify URL: {result['verify_url']}")
    return result


def poll_device_status(device_id: str, max_attempts: int = 30) -> Dict:
    """Poll device authorization status"""
    print("⏳ Polling device status...")

    for i in range(max_attempts):
        time.sleep(2)  # Wait 2 seconds between polls

        response = requests.post(
            f"{BASE_URL}/device/poll",
            json={'device_id': device_id},
            headers={'Content-Type': 'application/json'}
        )

        response.raise_for_status()
        data = response.json()
        status = data['status']

        print(f"Attempt {i + 1}: Status = {status}")

        if status == 'authorized':
            print("✅ Device authorized!")
            return data
        elif status == 'denied':
            raise Exception("Device authorization denied")
        elif status == 'expired':
            raise Exception("Device link code expired")

    raise Exception("Polling timeout")


# ============================================================================
# Subscription Management
# ============================================================================

def create_checkout_session(
    client: AGIWorkforceClient,
    plan: str,
    billing_interval: str
) -> Dict:
    """Create Stripe checkout session"""
    print(f"💳 Creating checkout for {plan} ({billing_interval})...")

    data = {
        'plan': plan,
        'billingInterval': billing_interval
    }

    response = client.post('/checkout', data)
    print(f"Checkout URL: {response['url']}")
    return response


def create_portal_session(client: AGIWorkforceClient) -> Dict:
    """Create billing portal session"""
    print("🔧 Creating billing portal session...")
    response = client.post('/portal')
    print(f"Portal URL: {response['url']}")
    return response


def sync_subscription(client: AGIWorkforceClient) -> Dict:
    """Sync subscription status"""
    print("🔄 Syncing subscription...")
    response = client.post('/sync-subscription')
    print(f"Subscription: {response['subscription']['plan_tier']}")
    return response


# ============================================================================
# Advanced Examples
# ============================================================================

def chat_with_context(
    client: AGIWorkforceClient,
    user_message: str,
    system_prompt: str
) -> Dict:
    """Chat with context and caching"""
    messages = [
        Message(role='system', content=system_prompt),
        Message(role='user', content=user_message)
    ]

    return create_chat_completion(
        client,
        messages,
        model='claude-sonnet-4',
        use_prompt_cache=True
    )


def safe_expensive_operation(
    client: AGIWorkforceClient,
    operation,
    required_credits: int = 10000
):
    """Monitor credits before expensive operation"""
    balance = get_credit_balance(client)

    if balance.credits_remaining_cents < required_credits:
        print(f"⚠️ Low credits! Only ${balance.credits_remaining_cents / 100:.2f} remaining.")

    if balance.daily_remaining_cents < 1000:
        raise Exception("Insufficient daily credits")

    return operation()


def batch_chat(
    client: AGIWorkforceClient,
    questions: List[str],
    **kwargs
) -> Dict:
    """Batch multiple questions into one request"""
    batched_question = '\n\n'.join(
        f"Question {i + 1}: {q}"
        for i, q in enumerate(questions)
    )

    messages = [Message(role='user', content=batched_question)]
    return create_chat_completion(client, messages, **kwargs)


def retry_with_backoff(func, max_retries: int = 3):
    """Retry with exponential backoff"""
    for i in range(max_retries):
        try:
            return func()
        except RateLimitError as e:
            if i == max_retries - 1:
                raise
            print(f"Rate limited. Retrying in {e.retry_after}s...")
            time.sleep(e.retry_after)
        except APIError as e:
            if i == max_retries - 1:
                raise
            delay = 2 ** i
            print(f"Error: {e.message}. Retrying in {delay}s...")
            time.sleep(delay)


def link_device(device_name: str) -> Dict:
    """Complete device linking flow"""
    # Generate link code
    link_data = generate_device_link_code(device_name)

    print(f"\n📱 Please visit: {link_data['verify_url']}\n")

    # Poll for authorization
    auth_data = poll_device_status(link_data['device_id'])

    return {
        'access_token': auth_data['access_token'],
        'refresh_token': auth_data['refresh_token'],
        'user': auth_data['user']
    }


# ============================================================================
# Custom Exceptions
# ============================================================================

class APIError(Exception):
    """API error"""
    def __init__(self, message: str, status: int, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


class RateLimitError(APIError):
    """Rate limit error"""
    def __init__(self, message: str, retry_after: int):
        super().__init__(message, 429, 'RATE_LIMIT_EXCEEDED')
        self.retry_after = retry_after


# ============================================================================
# Example Usage
# ============================================================================

def main():
    """Run example operations"""
    client = AGIWorkforceClient(TOKEN)

    try:
        # 1. Get user info
        user = get_current_user(client)

        # 2. Check credits
        balance = get_credit_balance(client)

        # 3. Simple chat
        messages = [Message(role='user', content='What is the capital of France?')]
        response = create_chat_completion(client, messages)
        answer = response['choices'][0]['message']['content']
        print(f"Answer: {answer}")

        # 4. Streaming chat
        print("\nStreaming response:")
        messages = [Message(role='user', content='Write a haiku about coding')]
        for chunk in stream_chat_completion(client, messages):
            print(chunk, end='', flush=True)
        print("\n")

        # 5. Chat with caching
        cached_response = chat_with_context(
            client,
            'How do I read a CSV file?',
            'You are a helpful coding assistant with expertise in Python.'
        )

        # 6. Safe operation with credit check
        def expensive_op():
            messages = [Message(role='user', content='Explain quantum computing')]
            return create_chat_completion(client, messages, max_tokens=2000)

        safe_expensive_operation(client, expensive_op)

        # 7. Batch questions
        questions = [
            'What is 2+2?',
            'What is the speed of light?',
            'Who wrote "1984"?'
        ]
        batch_response = batch_chat(client, questions)

        # 8. List models
        models = list_models(client)
        for model in models[:5]:
            print(f"- {model['id']} ({model['owned_by']})")

        print("\n✅ All examples completed successfully!")

    except APIError as e:
        print(f"❌ API Error: {e.message} (status: {e.status}, code: {e.code})")
    except Exception as e:
        print(f"❌ Error: {str(e)}")


if __name__ == '__main__':
    main()
