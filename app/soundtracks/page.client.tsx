export default function mount() {
  const input = document.getElementById(
    "explore-search",
  ) as HTMLInputElement | null;
  const count = document.getElementById("explore-count");
  const cards = [
    ...document.querySelectorAll<HTMLElement>("[data-soundtrack-card]"),
  ];
  const groups = [
    ...document.querySelectorAll<HTMLElement>("[data-explore-group]"),
  ];
  function apply() {
    const q = (input?.value || "").trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const hay = card.getAttribute("data-search") || "";
      const ok = !q || hay.includes(q);
      card.style.display = ok ? "" : "none";
      if (ok) shown++;
    }
    for (const group of groups) {
      const visible = [
        ...group.querySelectorAll<HTMLElement>("[data-soundtrack-card]"),
      ].some((c) => c.style.display !== "none");
      group.style.display = visible ? "" : "none";
    }
    if (count)
      count.textContent = q
        ? `${shown} matching soundtrack${shown === 1 ? "" : "s"}`
        : `${cards.length} public soundtrack${cards.length === 1 ? "" : "s"}`;
  }
  input?.addEventListener("input", apply);
  apply();
  return () => input?.removeEventListener("input", apply);
}
