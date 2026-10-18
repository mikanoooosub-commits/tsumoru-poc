# eval/key — 評価役ごとの「案の番号 → 中の名前」(評価役には渡していない)

- 作成: 2026-10-18 / 作成: 作業役(WO-022 段2.6)
- 評価役には、案の名前・どれが新しいか・どれが今の本番か・作った順番を伝えていない。番号は評価役ごとに並べ替えた(7×7 のラテン方格から4行。同じ案が2体で同じ番号にならない)。
- 乱数の種: **20261019**(20261018 から始め、「今の本番」「D 直し2」が2体以上で最初か最後に来ない種まで1ずつ進めた)。スクリプトはスクラッチパッド(`wo022-eval-plan/build.py`)。リポジトリには入れていない。

## 番号 → 中の名前
| 番号 | r1 見積担当 | r2 社長兼営業 | r3 LP の訪問者 | r4 批判役 |
|---|---|---|---|---|
| 案1 | D 初版 | C(段2) | 今の本番 | D 直し1 |
| 案2 | B(段2) | D 直し1 | D 直し2(今) | 今の本番 |
| 案3 | A(段2) | 今の本番 | D 初版 | D 直し2(今) |
| 案4 | C(段2) | D 直し2(今) | B(段2) | D 初版 |
| 案5 | D 直し1 | D 初版 | A(段2) | B(段2) |
| 案6 | 今の本番 | B(段2) | C(段2) | A(段2) |
| 案7 | D 直し2(今) | A(段2) | D 直し1 | C(段2) |

## 中の名前 → 元の画像(`design-audit/` からの相対)
| 中の名前 | 主画面 PC | 主画面 スマホ | 一覧 | 登録・編集 | 状態 |
|---|---|---|---|---|---|
| A(段2) | `v2-shots/Main-1280.jpg`(元の題「案A 主画面 PC」) | `v2-shots/A2-main-sp-375.jpg` | `v2-shots/A3-list-pc-1280.jpg` | `v2-shots/A4-form-sp-375.jpg` | `v2-shots/A5-states-pc-1280.jpg` |
| B(段2) | `v2-shots/B1-main-pc-1280.jpg` | `v2-shots/B2-main-sp-375.jpg` | `v2-shots/B3-list-pc-1280.jpg` | `v2-shots/B4-form-sp-375.jpg` | `v2-shots/B5-states-pc-1280.jpg` |
| C(段2) | `v2-shots/C1-main-pc-1280.jpg` | `v2-shots/C2-main-sp-375.jpg` | `v2-shots/C3-list-pc-1280.jpg` | `v2-shots/C4-form-sp-375.jpg` | `v2-shots/C5-states-pc-1280.jpg` |
| D 初版 | `v2-shots/D-v1/D1-main-pc-1280.jpg` | `v2-shots/D-v1/D2-main-sp-375.jpg` | `v2-shots/D-v1/D3-list-pc-1280.jpg` | `v2-shots/D-v1/D4-form-sp-375.jpg` | `v2-shots/D-v1/D5-states-pc-1280.jpg` |
| D 直し1 | `v2-shots/D-v2/D1-main-pc-1280.jpg` | `v2-shots/D-v2/D2-main-sp-375.jpg` | `v2-shots/D-v2/D3-list-pc-1280.jpg` | `v2-shots/D-v2/D4-form-sp-375.jpg` | `v2-shots/D-v2/D5-states-pc-1280.jpg` |
| D 直し2(今) | `v2-shots/D1-main-pc-1280.jpg` +「たたんだ所を開いた状態」`v2-shots/D1b-main-pc-open-1280.jpg` | `v2-shots/D2-main-sp-375.jpg` | `v2-shots/D3-list-pc-1280.jpg` | `v2-shots/D4-form-sp-375.jpg`(D 直し1 と同じ画像) | `v2-shots/D5-states-pc-1280.jpg` |
| 今の本番 | `before/b03-tokushoku-result-pc.jpg` | `before/b09-tokushoku-result-sp.jpg` | `before/b06-list-dialog-pc.jpg` | `before/b07-create-dialog-pc.jpg`(PC) | `before/b04-weak-result-pc.jpg`・`before/b05-qty-error-pc.jpg` |

## 渡した範囲
| 評価役 | 範囲 | 枚数(切り分け後) |
|---|---|---|
| r1 見積担当 | 主画面 PC・スマホ・一覧・登録・状態 | 76 |
| r2 社長兼営業 | 主画面 PC・スマホ・一覧 | 53 |
| r3 LP の訪問者 | 主画面 PC・スマホ | 44 |
| r4 批判役 | 主画面 PC・スマホ・一覧・登録・状態 | 76 |

## 写しの作り方(元の画像は変えていない)
- 切り分け: スマホ(幅 375)は高さ 1,000px、PC(幅 1,280)は 1,100px ごと。前後 80px 重ねる。高さが上限+150px 以内なら切らない。
- 塗りつぶし(状態の見本だけ): 上の見出し「案A の状態の見本」など、案の名前が写っている帯を地の色で塗り、「状態の見本」とだけ書き直した。D 初版は大きな見出しの「案D の状態 — …」を「空・誤り・根拠が弱い・古い叩き台・該当なし・実行中」に。D 直し2 は作り手向けの注記「PC は『主画面 PC(根拠を開いた状態)』のボード」を消し、「根拠を開いた状態(スマホ・「開く」を押した後)」に書き直した。
- 確かめたこと: 塗った所を目で確認。元の HTML の中で案の名前が出るのは `<title>`(画像に写らない)と状態の見本の見出しだけであることを確認。切った写しを抜き取りで見て、字が読めることを確認。
- 評価役への頼み方は `prompts/` に全文。評価役のフォルダには、写しの画像と頼み方の写し(`お願い.md`)だけを置いた。
