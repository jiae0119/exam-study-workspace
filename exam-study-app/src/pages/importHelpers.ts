export function readFileText(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") resolve(r.result);
      else reject(new Error("파일을 문자열로 읽을 수 없습니다."));
    };
    r.onerror = () => reject(new Error("파일 읽기 실패"));
    r.readAsText(f, "UTF-8");
  });
}
