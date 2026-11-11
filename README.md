# 상세페이지 제작기 (우진글로벌)

제품군마다 손님이 사고 싶어지는 이유가 달라서, 전략과 제작기를 제품군마다 따로 둡니다.
주소: https://wjwj1935-wq.github.io/-/

## 폴더

| 폴더 | 무엇 | 주소 |
|---|---|---|
| `index.html` | 메인. 제품군을 고르는 첫 화면 | `/-/` |
| `handle/` | 방문 손잡이·도어 제작기 | `/-/handle/` |
| `cleaning/` | 청소용품 제작기 | `/-/cleaning/` |
| `docs/` | 전략 문서, 업데이트 방식, 할 일 목록 | |
| `tools/` | 손잡이 제작기를 만드는 도구 | |

## 문서

- [업데이트 방식](docs/update-strategy.md): 매일 아침 알림, 매주 월요일 버전 올리기
- [할 일 목록](docs/backlog.md): 매일 알림이 여기서 "오늘 고칠 한 가지"를 고릅니다
- [청소용품 전략](docs/cleaning-strategy.md)
- [손잡이·도어 전략](docs/handle-strategy.md)

## 고치는 법

**손잡이 제작기**
1. `handle/src/index.fragment.html`을 고칩니다(안의 `VER=` 숫자를 올립니다).
2. `python3 -I tools/build_site.py`를 실행합니다. `handle/index.html`과 `version.json`이 새로 만들어집니다.

**청소용품 제작기**
1. 전략(구역 순서, 글 규칙, 장면 지시문)은 `cleaning/strategy.js`, 움직이는 부분은 `cleaning/app.js`, 모양은 `cleaning/style.css`를 고칩니다.
2. `cleaning/app.js`의 `VER`와 `cleaning/version.json`의 숫자를 같이 올립니다. `cleaning/index.html`의 `?v=` 숫자도 같이 올립니다.

**올리기**: `main`에 올리면 주소가 자동으로 최신이 됩니다. 열려 있는 화면에는 "새 버전이 나왔어요" 단추가 뜹니다.

## 새 제품군을 더하는 법

1. 그 제품군의 전략부터 `docs/`에 씁니다(어떤 손님이 왜 사는지, 구역 순서, 사진 장면).
2. 새 폴더를 만듭니다. 청소용품처럼 "사진 한 장 → 자동" 방식이면 `cleaning/`을 복사해 `strategy.js`를 새로 씁니다.
3. 메인 `index.html`의 `KINDS` 목록에 한 줄을 더합니다.

제품군끼리 전략을 섞지 않습니다. 한 제품군에서 잘 된 방법도 다른 제품군에는 따로 판단해서 넣습니다.

## 키(API key)

구글 AI 스튜디오 키와 클로드 키는 쓰는 사람이 화면에 직접 붙여 넣습니다.
이 저장소에는 키가 들어 있지 않고, 들어가서도 안 됩니다.
