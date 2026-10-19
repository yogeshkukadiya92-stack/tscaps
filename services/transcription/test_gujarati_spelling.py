import json
import httpx
import pytest
from fastapi import HTTPException
from gujarati_spelling import apply_corrections, proofread_reference


def test_spelling_repairs_compound_without_losing_function_words_or_names():
    source = 'એવું મને લાગે છે. એમરોડેરીવાળા ભાઈઓ માટે Wilcom Codex'
    output = apply_corrections(source, [{'index': 4, 'text': 'એમ્બ્રોઇડરીવાળા'}])
    assert output == 'એવું મને લાગે છે. એમ્બ્રોઇડરીવાળા ભાઈઓ માટે Wilcom Codex'
    assert len(output.split()) == len(source.split())


def test_spelling_cannot_replace_short_words_names_or_unrelated_meaning():
    source = 'છે Wilcom ડિઝાઇનરની'
    assert apply_corrections(source, [{'index': 0, 'text': 'નહીં'},
        {'index': 1, 'text': 'વેલકમ'}, {'index': 2, 'text': 'ગુજરાતી'}]) == source
    for corrections in [[{'index': 2, 'text': 'ડિઝાઇનર ની'}], [{'index': -1, 'text': 'ડિઝાઇનર'}]]:
        with pytest.raises(ValueError): apply_corrections(source, corrections)


def test_proofreading_uses_existing_private_key_and_bounded_structured_output(monkeypatch, tmp_path):
    monkeypatch.setenv('OPENAI_API_KEY', 'test')
    monkeypatch.setenv('PROCESSING_BUDGET_DB', str(tmp_path/'budget.sqlite'))
    def handle(request):
        assert request.url.path == '/v1/chat/completions'
        assert request.headers['authorization'] == 'Bearer test'
        body = json.loads(request.content)
        assert body['max_completion_tokens'] == 1024
        assert body['response_format']['json_schema']['strict'] is True
        return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(
            {'corrections': [{'index': 0, 'text': 'એમ્બ્રોઇડરીવાળા'}]})}}]})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        assert proofread_reference(client, 'એમરોડેરીવાળા ભાઈઓ માટે') == 'એમ્બ્રોઇડરીવાળા ભાઈઓ માટે'


def test_proofreading_cannot_bypass_the_shared_openai_cap(monkeypatch, tmp_path):
    monkeypatch.setenv('PROCESSING_BUDGET_DB', str(tmp_path/'budget.sqlite'))
    monkeypatch.setenv('OPENAI_TRANSCRIPTION_MONTHLY_USD_LIMIT', '0.000001')
    with httpx.Client(transport=httpx.MockTransport(lambda _: pytest.fail('Paid call must be blocked'))) as client:
        with pytest.raises(HTTPException) as error:
            proofread_reference(client, 'ગુજરાતી વાતચીત છે')
    assert error.value.status_code == 429


def test_canonical_loanword_keeps_suffix_punctuation_and_unrelated_words():
    from gujarati_spelling import canonicalize_loanwords
    text = 'એમ્બ્રોડેરીવાળા, એમરોડેરીમાં એમ્બ્રોડરીની છે Wilcom એમરોડેરીપણ'
    output = canonicalize_loanwords(text)
    assert output == 'એમ્બ્રોઇડરીવાળા, એમ્બ્રોઇડરીમાં એમ્બ્રોઇડરીની છે Wilcom એમરોડેરીપણ'
    assert len(output.split()) == len(text.split())
