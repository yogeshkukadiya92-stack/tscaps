import httpx
import numpy as np
import pytest
from fastapi import HTTPException

from groq_provider import transcribe_groq
from gujarati_transcription import correct_aligned_spelling, enabled


@pytest.fixture(autouse=True)
def setup(monkeypatch, tmp_path):
    monkeypatch.setenv('GROQ_API_KEY', 'groq-test')
    monkeypatch.setenv('OPENAI_API_KEY', 'openai-test')
    monkeypatch.setenv('GUJARATI_AUDIO_ASSIST', 'true')
    monkeypatch.setenv('PROCESSING_BUDGET_DB', str(tmp_path / 'budget.sqlite'))
    monkeypatch.setenv('GROQ_MONTHLY_USD_LIMIT', '5')
    monkeypatch.setenv('OPENAI_TRANSCRIPTION_MONTHLY_USD_LIMIT', '5')


def test_openai_transcript_is_forced_aligned_instead_of_whisper_prompt(monkeypatch):
    calls = []
    expected = [{'word': 'ડિઝાઇનરની', 'start': .8, 'end': 1.5},
                {'word': 'જોબ', 'start': 1.5, 'end': 2.0}]
    def align(pcm, reference):
        assert len(pcm) == 8 * 16000
        assert reference == 'ડિઝાઇનરની જોબ'
        return expected
    monkeypatch.setattr('gujarati_alignment.align_reference', align)
    def handle(request):
        calls.append(request.url.host)
        assert request.url.host == 'api.openai.com'
        assert request.headers['authorization'] == 'Bearer openai-test'
        assert b'gpt-transcribe' in request.content
        assert b'languages[]' in request.content
        assert b'name="language"' not in request.content
        return httpx.Response(200, json={'text': 'ડિઝાઇનરની જોબ'})
    result = transcribe_groq(np.zeros(8 * 16000), 'gu', httpx.MockTransport(handle))
    assert calls == ['api.openai.com']
    assert result['words'] == [{'text': w['word'], 'start': w['start'], 'end': w['end']} for w in expected]
    assert result['transcription']['alignment'] == 'whisper-attention'


def test_full_reel_keeps_sentence_context(monkeypatch):
    monkeypatch.setattr('gujarati_alignment.align_reference', lambda pcm, _: [
        {'word': 'એમ્બ્રોઇડરીવાળા', 'start': 4.9, 'end': 5.6},
        {'word': 'છે', 'start': 55, 'end': 55.3}])
    calls = []
    def handle(request):
        calls.append(request.url.host)
        return httpx.Response(200, json={'text': 'એમ્બ્રોઇડરીવાળા છે'})
    result = transcribe_groq(np.zeros(60 * 16000), 'gu', httpx.MockTransport(handle))
    assert calls == ['api.openai.com']
    assert [w['start'] for w in result['words']] == [4.9, 55]


def test_long_recording_splits_near_quiet_audio_without_lost_samples():
    from gujarati_alignment import audio_windows
    pcm = np.ones(602 * 16000, dtype=np.float32)
    pcm[598 * 16000:599 * 16000] = 0
    windows = list(audio_windows(pcm))
    assert windows[0][0] == 0 and windows[-1][1] == len(pcm)
    assert windows[0][1] == windows[1][0]
    assert 598 <= windows[0][1] / 16000 < 599
    assert all(b - a <= 600 * 16000 for a, b in windows)


@pytest.mark.parametrize('items', [
    [{'word': 'ખોટું', 'start': 0, 'end': 5.66}],
    [{'word': 'શબ્દ', 'start': 8, 'end': 8}],
    [{'word': 'શબ્દ', 'start': float('nan'), 'end': 1}],
    [{'word': 'એક', 'start': 1, 'end': 2}, {'word': 'બે', 'start': .5, 'end': 1}],
    [],
])
def test_unreliable_alignment_is_never_published(monkeypatch, items):
    monkeypatch.setattr('gujarati_alignment.align_reference', lambda *_: items)
    with pytest.raises(HTTPException):
        transcribe_groq(np.zeros(8 * 16000), 'gu', httpx.MockTransport(
            lambda _: httpx.Response(200, json={'text': 'ગુજરાતી શબ્દ'})))


def test_new_words_do_not_receive_made_up_timing():
    original = [{'word': 'વાત', 'start': 0, 'end': .4}, {'word': 'છે', 'start': 25, 'end': 26}]
    assert correct_aligned_spelling(original, 'વાત પછી ઘણા નવા શબ્દો છે') == original
    assert correct_aligned_spelling(original, 'અલગ વાક્ય') == original


def test_assist_failure_does_not_silently_return_uncorrected_captions():
    with pytest.raises(HTTPException) as error:
        transcribe_groq(np.zeros(16000), 'gu', httpx.MockTransport(lambda _: httpx.Response(401)))
    assert error.value.status_code == 503


def test_assist_budget_blocks_paid_calls(monkeypatch):
    monkeypatch.setenv('OPENAI_TRANSCRIPTION_MONTHLY_USD_LIMIT', '0.000001')
    calls = []
    with pytest.raises(HTTPException) as error:
        transcribe_groq(np.zeros(16000), 'gu', httpx.MockTransport(lambda r: calls.append(r)))
    assert error.value.status_code == 429
    assert calls == []


def test_explicit_enable_requires_key(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY')
    with pytest.raises(HTTPException):
        enabled()
    monkeypatch.setenv('GUJARATI_AUDIO_ASSIST', 'auto')
    assert enabled() is False


def test_other_languages_do_not_send_audio_to_openai():
    calls = []
    def handle(request):
        calls.append(request.url.host)
        return httpx.Response(200, json={'words': [{'word': 'hello', 'start': 0, 'end': .5}]})
    transcribe_groq(np.zeros(16000), 'en', httpx.MockTransport(handle))
    assert calls == ['api.groq.com']


def test_alignment_diagnostics_do_not_expose_transcript(monkeypatch):
    import gujarati_alignment
    class FailedModel:
        def align(self, *_args, **_kwargs):
            raise RuntimeError('private caption text')
    monkeypatch.setattr(gujarati_alignment, 'alignment_model', lambda: FailedModel())
    with pytest.raises(HTTPException) as failure:
        gujarati_alignment.align_reference(np.zeros(16000), 'private caption text')
    assert 'private caption text' not in str(failure.value.detail)
    assert gujarati_alignment.last_failure['type'] == 'RuntimeError'
    assert 'private caption text' not in str(gujarati_alignment.last_failure)


def test_missing_model_audio_config_fails_before_serving(monkeypatch, tmp_path):
    import sys
    from types import SimpleNamespace
    import gujarati_alignment
    gujarati_alignment.alignment_model.cache_clear()
    monkeypatch.setenv('GUJARATI_ALIGNMENT_MODEL', str(tmp_path))
    load = lambda *_a, **_k: pytest.fail('Must validate assets before model loading')
    monkeypatch.setitem(sys.modules, 'stable_whisper', SimpleNamespace(load_faster_whisper=load))
    with pytest.raises(RuntimeError, match='preprocessing configuration'):
        gujarati_alignment.alignment_model()
    gujarati_alignment.alignment_model.cache_clear()


def test_wrong_mel_configuration_fails_before_serving(monkeypatch, tmp_path):
    import sys
    from types import SimpleNamespace
    import gujarati_alignment
    gujarati_alignment.alignment_model.cache_clear()
    (tmp_path / 'preprocessor_config.json').write_text('{}')
    monkeypatch.setenv('GUJARATI_ALIGNMENT_MODEL', str(tmp_path))
    model = SimpleNamespace(feature_extractor=SimpleNamespace(mel_filters=np.zeros((80, 201))),
                            model=SimpleNamespace(n_mels=128))
    monkeypatch.setitem(sys.modules, 'stable_whisper', SimpleNamespace(load_faster_whisper=lambda *_a, **_k: model))
    with pytest.raises(RuntimeError, match='does not match'):
        gujarati_alignment.alignment_model()
    gujarati_alignment.alignment_model.cache_clear()


def test_aligner_cannot_silently_drop_a_spoken_word(monkeypatch):
    import gujarati_alignment
    class Result:
        def to_dict(self):
            return {'segments': [{'words': [{'word': 'વાત', 'start': 0, 'end': .4}]}]}
    class Model:
        def align(self, *_args, **kwargs):
            assert kwargs['remove_instant_words'] is False
            return Result()
    monkeypatch.setattr(gujarati_alignment, 'alignment_model', lambda: Model())
    with pytest.raises(HTTPException):
        gujarati_alignment.align_reference(np.zeros(16000), 'વાત છે')


def test_legacy_openai_model_uses_singular_language_hint(monkeypatch):
    from gujarati_transcription import audio_reference
    monkeypatch.setenv('GUJARATI_TRANSCRIPTION_MODEL', 'gpt-4o-transcribe')
    def handle(request):
        assert b'gpt-4o-transcribe' in request.content
        assert b'name="language"' in request.content
        assert b'languages[]' not in request.content
        return httpx.Response(200, json={'text': 'વાત છે'})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        assert audio_reference(client, b'audio', 10) == 'વાત છે'
