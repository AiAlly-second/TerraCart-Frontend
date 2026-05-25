import { useState } from "react";
import { MenuItemCard } from "./MenuItemCard.jsx";

/** Collapsible category section */
export function MenuCategoryBlock({
  category,
  items,
  cart,
  onAdd,
  onRemove,
  translateText,
  defaultOpen = false,
}) {
  if (!category) return null;

  const translatedCategory =
    typeof translateText === "function"
      ? translateText(category || "", "category")
      : category;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="category-wrapper">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="category-button"
      >
        {translatedCategory || category} <span>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="category-items">
          {safeItems.map((item, idx) => (
            <MenuItemCard
              key={item?._id || `${category}-${idx}`}
              item={item}
              onAdd={onAdd}
              onRemove={onRemove}
              count={cart[item?.name] || 0}
              translateText={translateText}
            />
          ))}
        </div>
      )}
    </div>
  );
}
