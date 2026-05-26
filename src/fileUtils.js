export function download(name, body, type) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = name;
  a.click();

  URL.revokeObjectURL(url);
}
