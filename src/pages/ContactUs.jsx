import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import restaurantBg from "../assets/images/restaurant-img.jpg";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return String(value._id || value.id || "");
  }
  return String(value);
};

const getStoredTableData = () => {
  try {
    const raw = localStorage.getItem("terra_selectedTable");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function ContactUs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contact, setContact] = useState(location.state?.contact || null);

  useEffect(() => {
    let cancelled = false;

    const resolveCartId = async () => {
      const fromState = normalizeId(location.state?.cartId);
      if (fromState) return fromState;

      const fromQuery = searchParams.get("cartId");
      if (fromQuery) return fromQuery;

      const selectedCartId = localStorage.getItem("terra_selectedCartId");
      if (selectedCartId) return selectedCartId;

      const takeawayCartId = localStorage.getItem("terra_takeaway_cartId");
      if (takeawayCartId) return takeawayCartId;

      const tableData = getStoredTableData();
      const fromTable = normalizeId(tableData?.cartId || tableData?.cafeId);
      if (fromTable) return fromTable;

      const tableId = normalizeId(tableData?.id || tableData?._id);
      if (tableId) {
        try {
          const cartIdRes = await fetch(
            `${nodeApi}/api/tables/public-cart-id/${encodeURIComponent(tableId)}`,
          );
          if (cartIdRes.ok) {
            const cartIdJson = await cartIdRes.json().catch(() => ({}));
            if (cartIdJson?.success && cartIdJson?.cartId) {
              return String(cartIdJson.cartId);
            }
          }
        } catch {
          // Continue to table slug fallback
        }
      }

      const tableSlug = searchParams.get("table");
      const sessionToken = localStorage.getItem("terra_sessionToken") || "";
      if (!tableSlug) return "";

      try {
        const lookupRes = await fetch(
          `${nodeApi}/api/tables/lookup/${encodeURIComponent(tableSlug)}${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ""}`,
        );
        if (!lookupRes.ok) return "";
        const lookupJson = await lookupRes.json().catch(() => ({}));
        const table = lookupJson?.table || null;
        const cartIdFromSlug = normalizeId(table?.cartId || table?.cafeId);
        if (cartIdFromSlug) {
          return cartIdFromSlug;
        }
        return "";
      } catch {
        return "";
      }
    };

    const loadContact = async () => {
      setLoading(true);
      setError("");
      try {
        const stateContact = location.state?.contact || null;
        const cartId = await resolveCartId();
        if (!cartId && stateContact) {
          if (!cancelled) {
            setContact(stateContact);
          }
          return;
        }
        if (!cartId) {
          throw new Error("Unable to find store context. Please open Contact Us from Menu page.");
        }

        const res = await fetch(
          `${nodeApi}/api/carts/public-contact?cartId=${encodeURIComponent(cartId)}`,
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          throw new Error(json?.message || "Failed to load contact details.");
        }

        if (!cancelled) {
          setContact(json?.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load contact details.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadContact();
    return () => {
      cancelled = true;
    };
  }, [location.state, searchParams]);

  const phone = contact?.contactPhone || "";
  const email = contact?.contactEmail || "";

  return (
    <div className="relative min-h-screen">
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${restaurantBg})` }}
      />
      <div className="fixed inset-0 bg-black/40" />

      <Header showNavigationTabs={false} />

      <main className="relative z-10 px-4 pt-24 pb-24">
        <div className="mx-auto max-w-md rounded-2xl border border-white/30 bg-white/95 p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-[#4a2e1f]">Contact Us</h1>
          <p className="mt-1 text-sm text-[#6b4a35]">
            {contact?.name || "Store Support"}
          </p>

          {loading && <p className="mt-6 text-sm text-gray-600">Loading contact details...</p>}

          {!loading && error && (
            <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {!loading && !error && (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-[#ead7c9] bg-[#fff8f2] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8a5d42]">
                  Phone
                </p>
                <p className="mt-1 text-base font-medium text-[#3f2a1e]">
                  {phone || "Not provided"}
                </p>
              </div>

              <div className="rounded-lg border border-[#ead7c9] bg-[#fff8f2] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8a5d42]">
                  Email
                </p>
                <p className="mt-1 text-base font-medium text-[#3f2a1e]">
                  {email || "Not provided"}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/\s/g, "")}`}
                    className="flex-1 rounded-lg bg-[#d86d2a] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#c75b1a]"
                  >
                    Call
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 cursor-not-allowed rounded-lg bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-600"
                  >
                    Call
                  </button>
                )}

                {email ? (
                  <a
                    href={`mailto:${email}`}
                    className="flex-1 rounded-lg border border-[#d86d2a] px-4 py-2 text-center text-sm font-semibold text-[#d86d2a] hover:bg-[#fff1e8]"
                  >
                    Email
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 cursor-not-allowed rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-500"
                  >
                    Email
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-6 w-full rounded-lg border border-[#c8aa95] px-4 py-2 text-sm font-semibold text-[#5a3a27] hover:bg-[#f6e7db]"
          >
            Back
          </button>
        </div>
      </main>
    </div>
  );
}
