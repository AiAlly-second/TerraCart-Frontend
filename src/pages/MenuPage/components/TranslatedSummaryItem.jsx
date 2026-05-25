/** Summary line for order invoice / cart summaries */
export function TranslatedSummaryItem({ item, qty, translateText }) {
  const translatedItem =
    typeof translateText === "function"
      ? translateText(item || "", "item")
      : item;
  return (
    <li className="summary-item">
      {qty} x {translatedItem}
    </li>
  );
}
