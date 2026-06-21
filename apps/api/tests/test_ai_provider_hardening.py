from types import SimpleNamespace

import pytest

from app.ai import llm_service, transcription_service
from app.ai.provider_utils import (
    ProviderConfigurationError,
    ProviderRequestError,
    sanitize_provider_error,
)
from app.core.config import settings


class FakeChatCompletions:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content="  provider answer  ")
                )
            ]
        )


class FakeAudioTranscriptions:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return " transcript "


class FakeOpenAI:
    instances: list["FakeOpenAI"] = []

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.chat_completions = FakeChatCompletions()
        self.audio_transcriptions = FakeAudioTranscriptions()
        self.chat = SimpleNamespace(completions=self.chat_completions)
        self.audio = SimpleNamespace(transcriptions=self.audio_transcriptions)
        self.instances.append(self)


@pytest.fixture(autouse=True)
def reset_fake_openai() -> None:
    FakeOpenAI.instances.clear()


def test_groq_chat_uses_configured_model_timeout_and_retries(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_provider_base_url", None)
    monkeypatch.setattr(settings, "llm_provider_timeout_seconds", 12.0)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 0)
    monkeypatch.setattr(settings, "llm_model_name", "llama-custom-prod")
    monkeypatch.setattr(settings, "llm_temperature", 0.1)
    monkeypatch.setattr(settings, "llm_max_tokens", 321)
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FakeOpenAI)

    answer = llm_service.generate_answer("prompt")

    assert answer == "provider answer"
    client = FakeOpenAI.instances[0]
    assert client.kwargs["api_key"] == "gsk_test_secret"
    assert client.kwargs["base_url"] == "https://api.groq.com/openai/v1"
    assert client.kwargs["timeout"] == 12.0
    assert client.kwargs["max_retries"] == 0
    assert client.chat_completions.calls[0]["model"] == "llama-custom-prod"
    assert client.chat_completions.calls[0]["temperature"] == 0.1
    assert client.chat_completions.calls[0]["max_tokens"] == 321


def test_groq_chat_does_not_default_to_openai_model(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_provider_api_key", "gsk_test_secret")
    monkeypatch.setattr(settings, "llm_provider_base_url", None)
    monkeypatch.setattr(settings, "llm_provider_timeout_seconds", 12.0)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 0)
    monkeypatch.setattr(settings, "llm_model_name", "gpt-4o-mini")
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FakeOpenAI)

    answer = llm_service.generate_answer("prompt")

    assert answer == "provider answer"
    assert FakeOpenAI.instances[0].chat_completions.calls[0]["model"] == "llama-3.1-8b-instant"


def test_chat_provider_errors_are_sanitized_and_bounded(monkeypatch) -> None:
    class FailingCompletions:
        attempts = 0

        def create(self, **kwargs):
            self.attempts += 1
            raise RuntimeError("bad key sk-secret-value api_key=gsk_hidden")

    class FailingOpenAI(FakeOpenAI):
        def __init__(self, **kwargs) -> None:
            super().__init__(**kwargs)
            self.chat = SimpleNamespace(completions=FailingCompletions())

    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "llm_provider_api_key", "sk-real-secret")
    monkeypatch.setattr(settings, "llm_provider_base_url", None)
    monkeypatch.setattr(settings, "llm_provider_max_retries", 1)
    monkeypatch.setattr(llm_service, "_get_openai_client_class", lambda: FailingOpenAI)

    with pytest.raises(ProviderRequestError) as exc_info:
        llm_service.generate_answer("prompt")

    assert str(exc_info.value) == "AI provider is temporarily unavailable. Please try again."
    assert "secret" not in sanitize_provider_error("bad key sk-secret-value api_key=gsk_hidden")


def test_chat_requires_api_key_for_external_provider(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "llm_provider_api_key", "")

    with pytest.raises(ProviderConfigurationError, match="Chat provider is not configured"):
        llm_service.generate_answer("prompt")


def test_transcription_uses_independent_provider_configuration(monkeypatch) -> None:
    monkeypatch.setattr(settings, "transcription_provider", "groq")
    monkeypatch.setattr(settings, "transcription_provider_api_key", "gsk_transcription_secret")
    monkeypatch.setattr(settings, "transcription_provider_base_url", None)
    monkeypatch.setattr(settings, "transcription_model_name", "whisper-prod")
    monkeypatch.setattr(settings, "transcription_timeout_seconds", 44.0)
    monkeypatch.setattr(settings, "transcription_max_retries", 0)
    monkeypatch.setattr(settings, "llm_provider_api_key", "different_chat_secret")
    monkeypatch.setattr(transcription_service, "_get_openai_client_class", lambda: FakeOpenAI)

    transcript = transcription_service.transcribe_audio(b"audio-bytes", "clip.webm", "hi")

    assert transcript == "transcript"
    client = FakeOpenAI.instances[0]
    assert client.kwargs["api_key"] == "gsk_transcription_secret"
    assert client.kwargs["api_key"] != settings.llm_provider_api_key
    assert client.kwargs["base_url"] == "https://api.groq.com/openai/v1"
    assert client.kwargs["timeout"] == 44.0
    call = client.audio_transcriptions.calls[0]
    assert call["model"] == "whisper-prod"
    assert call["language"] == "hi"


def test_disabled_transcription_provider_fails_safely(monkeypatch) -> None:
    monkeypatch.setattr(settings, "transcription_provider", "disabled")

    with pytest.raises(ProviderConfigurationError, match="Transcription provider is not configured"):
        transcription_service.transcribe_audio(b"audio-bytes", "clip.webm")
