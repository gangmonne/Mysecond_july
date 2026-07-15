/**
 * 세션 종료 설문 (P6) — 경험 5축: 친밀감 / 불편함 / 호기심 / 거리감 / 이해받음.
 * 결과는 브리지(/api/survey)로 보내 로컬 JSON 저장, 브리지가 없으면 localStorage 에 남긴다.
 */

export const AXES = ["친밀감", "불편함", "호기심", "거리감", "이해받음"] as const;

export interface SurveyResult {
  t: string;
  seed: number;
  durationMin: number;
  mirrorNotes: string[];
  axes: Record<(typeof AXES)[number], number>;
}

/** 설문 오버레이를 띄우고 제출까지 기다린다 */
export function showSurvey(
  root: HTMLElement,
  base: Pick<SurveyResult, "seed" | "durationMin" | "mirrorNotes">,
): Promise<SurveyResult> {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute", inset: "0", zIndex: "30", background: "rgba(18,16,14,0.97)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "18px", color: "#d8d2c8", padding: "24px",
    });

    const title = document.createElement("p");
    title.textContent = "식사는 끝났습니다. 방금의 시간은 어땠나요.";
    title.style.marginBottom = "8px";
    el.appendChild(title);

    const values = {} as SurveyResult["axes"];
    for (const axis of AXES) {
      values[axis] = 5;
      const row = document.createElement("label");
      Object.assign(row.style, {
        display: "grid", gridTemplateColumns: "6em 1fr 2em", gap: "12px",
        alignItems: "center", width: "min(420px, 80vw)", fontSize: "14px",
      });
      const name = document.createElement("span");
      name.textContent = axis;
      const input = document.createElement("input");
      Object.assign(input, { type: "range", min: "0", max: "10", step: "1", value: "5" });
      const val = document.createElement("span");
      val.textContent = "5";
      val.style.color = "#8c8072";
      input.oninput = () => {
        values[axis] = Number(input.value);
        val.textContent = input.value;
      };
      row.append(name, input, val);
      el.appendChild(row);
    }

    const done = document.createElement("button");
    done.textContent = "남기고 일어나기";
    Object.assign(done.style, {
      marginTop: "12px", padding: "10px 28px", background: "none", cursor: "pointer",
      border: "1px solid #3a332b", color: "#d8d2c8", fontSize: "14px", letterSpacing: "0.2em",
    });
    done.onclick = () => {
      el.remove();
      resolve({ t: new Date().toISOString(), ...base, axes: values });
    };
    el.appendChild(done);
    root.appendChild(el);
  });
}

/** 브리지 → 실패 시 localStorage. 어디에 남았는지를 돌려준다 */
export async function saveSurvey(result: SurveyResult): Promise<string> {
  try {
    const res = await fetch("/api/survey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const { saved } = (await res.json()) as { saved: string };
      return `server/sessions/${saved}`;
    }
    throw new Error(String(res.status));
  } catch {
    const key = `second-survey-${result.t}`;
    localStorage.setItem(key, JSON.stringify(result));
    return `localStorage["${key}"]`;
  }
}
