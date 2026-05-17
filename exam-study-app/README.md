# 시험문제 앱 (로컬 MVP)

React + Vite + TypeScript + IndexedDB로 구동하는 **1인용 로컬 웹앱**입니다.

## 사용법

```bash
cd exam-study-app
npm install
npm run dev
```

브라우저가 열리면 JSON을 `JSON` 화면에서 가져온 뒤 `시험`에서 주차/랜덤/n문제를 지정해 풀이하세요.

## JSON 형식 (요약)

```json
{
  "course": "과목명",
  "week": 1,
  "generatedAt": "2026-04-27T00:00:00+09:00",
  "questions": [
    {
      "id": "고유-id-001",
      "week": 1,
      "type": "short_answer | short_sentence | essay",
      "prompt": "문제 본문",
      "answer": {
        "model": "모범답(필수)",
        "keywords": ["키", "워드", "채점에 쓰임"],
        "rubric": ["서술형: 채점 포인트(선택)"],
        "synonyms": ["단답: 유의어(선택)"]
      },
      "explanation": "해설(선택)"
    }
  ]
}
```

다른 AI/GPT에게 붙여서 문제 JSON을 받을 때 참고 형식은 `public/examples/question-pack.example.json` 한 파일이면 된다.

## 서술형 AI

`설정`에 Anthropic API 키를 넣고 **서술형: AI 보조채점**을 켜면, 서술형 문제에서 `AI로 채점`을 쓸 수 있습니다. (키/요청은 브라우저 → Anthropic, 로컬 저장) 키가 없거나 끄면 `스스로: 정답/오답`만 씁니다.

## 저장 위치

문제, 시도 기록, 찜, 오답, 설정(키 포함)은 **이 브라우저의 IndexedDB**에만 있습니다.
