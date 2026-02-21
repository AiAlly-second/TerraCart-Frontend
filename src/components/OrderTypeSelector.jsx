import React, { useState, useEffect } from "react";
import { FaMapMarkerAlt, FaStore, FaTruck } from "react-icons/fa";
import "./OrderTypeSelector.css";

const OrderTypeSelector = ({
  selectedType,
  onTypeChange,
  customerLocation,
  onLocationChange,
  selectedCart,
  onCartChange,
  nearbyCarts = [],
  loading = false,
  texts = {},
}) => {
  const [locationError, setLocationError] = useState(null);
  const [manualAddress, setManualAddress] = useState("");
  const [fetchingAddress, setFetchingAddress] = useState(false);

  const getCartDisplayName = (cart) => {
    const resolvedName =
      (typeof cart?.cartAdminId?.cartName === "string" &&
        cart.cartAdminId.cartName.trim()) ||
      (typeof cart?.name === "string" && cart.name.trim()) ||
      (typeof cart?.cartAdminId?.cafeName === "string" &&
        cart.cartAdminId.cafeName.trim()) ||
      (typeof cart?.cartAdminId?.name === "string" &&
        cart.cartAdminId.name.trim());
    return resolvedName || "Store";
  };

  const getCartAddress = (cart) => {
    if (!cart) return null;

    if (typeof cart.address === "string" && cart.address.trim()) {
      return cart.address.trim();
    }

    if (cart.address && typeof cart.address === "object") {
      if (
        typeof cart.address.fullAddress === "string" &&
        cart.address.fullAddress.trim()
      ) {
        return cart.address.fullAddress.trim();
      }

      const structuredAddress = [
        cart.address.street,
        cart.address.city,
        cart.address.state,
        cart.address.zipCode,
      ]
        .filter((value) => typeof value === "string" && value.trim())
        .join(", ");

      if (structuredAddress) return structuredAddress;
    }

    if (typeof cart.location === "string" && cart.location.trim()) {
      return cart.location.trim();
    }

    return null;
  };

  const getDeliveryMetaText = (cart) => {
    if (!cart?.deliveryInfo) return null;

    const parts = [];
    if (typeof cart.deliveryInfo.deliveryCharge === "number") {
      parts.push(`Delivery: Rs.${cart.deliveryInfo.deliveryCharge}`);
    }
    if (typeof cart.deliveryInfo.estimatedTime === "number") {
      parts.push(`${Math.round(cart.deliveryInfo.estimatedTime)} min`);
    }
    if (typeof cart.deliveryInfo.distance === "number") {
      parts.push(`${cart.deliveryInfo.distance.toFixed(2)} km`);
    }

    return parts.length ? parts.join(" - ") : null;
  };

  const isPickupEnabled = (cart) => {
    if (typeof cart?.pickupEnabled === "boolean") return cart.pickupEnabled;
    if (typeof cart?.canPickup === "boolean") return cart.canPickup;
    return true;
  };

  const isDeliveryEnabled = (cart) => {
    if (typeof cart?.canDeliver === "boolean") return cart.canDeliver;
    if (typeof cart?.deliveryEnabled === "boolean") return cart.deliveryEnabled;
    return true;
  };

  const hasLocationCoordinates =
    typeof customerLocation?.latitude === "number" &&
    typeof customerLocation?.longitude === "number";
  const hasAddressInput = Boolean(
    customerLocation?.address?.trim() || manualAddress.trim(),
  );
  const showDeliveryStoreSelector =
    selectedType === "DELIVERY" && (hasLocationCoordinates || hasAddressInput);
  const deliveryCarts = nearbyCarts.filter(isDeliveryEnabled);
  const pickupCarts = nearbyCarts.filter(isPickupEnabled);

  const reverseGeocode = async (latitude, longitude) => {
    try {
      setFetchingAddress(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        {
          headers: {
            "User-Agent": "TerraCart-Ordering-System",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch address");
      }

      const data = await response.json();

      if (data && data.address) {
        const addr = data.address;
        const parts = [];

        if (addr.building) {
          parts.push(addr.building);
        } else if (addr.house_name) {
          parts.push(addr.house_name);
        } else if (addr.house_number) {
          const houseNum = addr.house_number.trim();
          if (houseNum) {
            parts.push(houseNum);
          }
        }

        if (addr.road) {
          parts.push(addr.road);
        }

        if (addr.city) {
          parts.push(addr.city);
        } else if (addr.town) {
          parts.push(addr.town);
        } else if (addr.village) {
          parts.push(addr.village);
        }

        if (addr.state) {
          if (addr.postcode) {
            parts.push(`${addr.state} - ${addr.postcode}`);
          } else {
            parts.push(addr.state);
          }
        } else if (addr.postcode) {
          parts.push(addr.postcode);
        }

        let formattedAddress = parts.join(", ");

        if (!formattedAddress || formattedAddress.trim().length === 0) {
          formattedAddress = data.display_name || "Address not available";
        }

        return formattedAddress;
      }

      return data.display_name || "Address not available";
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      return null;
    } finally {
      setFetchingAddress(false);
    }
  };

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setLocationError(null);
    setFetchingAddress(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        const formattedAddress = await reverseGeocode(latitude, longitude);

        const location = {
          latitude,
          longitude,
          address:
            formattedAddress ||
            manualAddress ||
            "Location coordinates captured",
        };

        if (formattedAddress) {
          setManualAddress(formattedAddress);
        }

        onLocationChange(location);
      },
      (error) => {
        setLocationError("Unable to get your location. Please enter manually.");
        setFetchingAddress(false);
        console.error("Geolocation error:", error);
      },
    );
  };

  useEffect(() => {
    const nextAddress = customerLocation?.address || "";
    setManualAddress((prev) => (prev === nextAddress ? prev : nextAddress));
  }, [customerLocation?.address]);

  return (
    <div className="order-type-selector">
      <h3 className="order-type-selector-title">
        {texts.title || "Choose Order Type"}
      </h3>

      <div className="order-type-options-grid">
        <label
          className={`order-type-option-card ${
            selectedType === "PICKUP" ? "active" : ""
          }`}
        >
          <input
            type="radio"
            name="orderType"
            value="PICKUP"
            checked={selectedType === "PICKUP"}
            onChange={() => onTypeChange("PICKUP")}
            className="hidden"
          />
          <FaStore className="order-type-option-icon" />
          <div className="order-type-option-title">
            {texts.pickupOption || "Pickup"}
          </div>
          <div className="order-type-option-desc">
            {texts.pickupDesc || "Order and collect from store"}
          </div>
        </label>

        <label
          className={`order-type-option-card ${
            selectedType === "DELIVERY" ? "active" : ""
          }`}
        >
          <input
            type="radio"
            name="orderType"
            value="DELIVERY"
            checked={selectedType === "DELIVERY"}
            onChange={() => onTypeChange("DELIVERY")}
            className="hidden"
          />
          <FaTruck className="order-type-option-icon" />
          <div className="order-type-option-title">
            {texts.deliveryOption || "Delivery"}
          </div>
          <div className="order-type-option-desc">
            {texts.deliveryDesc || "Get your order delivered"}
          </div>
        </label>
      </div>

      {(selectedType === "PICKUP" || selectedType === "DELIVERY") && (
        <div className="location-section">
          <h4 className="section-title">
            <FaMapMarkerAlt className="section-title-icon" />
            Your Location
          </h4>

          <div className="location-fields">
            <button
              type="button"
              onClick={getCurrentLocation}
              className="btn-location"
              disabled={fetchingAddress}
            >
              {fetchingAddress ? "Fetching location..." : "Use Current Location"}
            </button>

            <input
              type="text"
              placeholder="Enter your address or 6-digit pin code"
              value={manualAddress}
              onChange={(e) => {
                const addressValue = e.target.value;
                setManualAddress(addressValue);
                if (addressValue.trim()) {
                  onLocationChange({
                    address: addressValue,
                  });
                } else {
                  onLocationChange(null);
                }
              }}
              className="input-field"
            />
            <p className="helper-text">
              Tip: You can enter only your 6-digit pin code for faster location
              detection.
            </p>

            {locationError && (
              <p className="status-message status-danger">{locationError}</p>
            )}

            {customerLocation && (
              <div className="location-info">
                <p className="location-info-title">Your Location</p>
                <p className="location-info-text">
                  {customerLocation.address || "Location set"}
                </p>
                {customerLocation.latitude && customerLocation.longitude && (
                  <p className="location-info-coordinates">
                    Coordinates: {customerLocation.latitude.toFixed(6)},{" "}
                    {customerLocation.longitude.toFixed(6)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showDeliveryStoreSelector && (
          <div className="nearby-carts-section">
            <h4 className="section-title">Available Stores</h4>
            {loading ? (
              <p className="status-message status-neutral">
                Loading nearby stores...
              </p>
            ) : deliveryCarts.length === 0 ? (
              <div className="status-message status-danger">
                <p className="status-title">
                  No stores available for delivery in your area
                </p>
                <p className="status-note">
                  All stores are outside the delivery radius for your location.
                </p>
                <p className="status-note">
                  Try selecting Pickup instead, or enter a different address.
                </p>
              </div>
            ) : (
              <div className="carts-list">
                {deliveryCarts.map((cart) => {
                  const cartAddress = getCartAddress(cart);
                  const deliveryMetaText = getDeliveryMetaText(cart);
                  const hasDeliveryDistance =
                    typeof cart?.deliveryInfo?.distance === "number";

                  return (
                  <label
                    key={cart._id}
                    className={`cart-option ${
                      selectedCart?._id === cart._id ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="cart"
                      value={cart._id}
                      checked={selectedCart?._id === cart._id}
                      onChange={() => onCartChange(cart)}
                    />
                    <div className="cart-content">
                      <div className="cart-name">{getCartDisplayName(cart)}</div>
                      {cartAddress && (
                        <div className="cart-meta cart-meta-address">
                          {cartAddress}
                        </div>
                      )}
                      {typeof cart.distance === "number" && !hasDeliveryDistance && (
                        <div className="cart-meta">
                          {cart.distance.toFixed(2)} km away
                        </div>
                      )}
                      {deliveryMetaText && (
                        <div className="cart-meta cart-meta-success">
                          {deliveryMetaText}
                        </div>
                      )}
                    </div>
                  </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {selectedType === "PICKUP" && customerLocation && (
        <div className="pickup-carts-section">
          <h4 className="section-title">Select Store</h4>
          {loading ? (
            <p className="status-message status-neutral">Loading stores...</p>
          ) : pickupCarts.length === 0 ? (
            <div className="status-message status-warn">
              <p className="status-title">No stores available</p>
              <p className="status-note">Please ensure:</p>
              <ul className="status-list">
                <li>At least one cart exists in the system</li>
                <li>Carts have pickup enabled</li>
                <li>Backend server is running</li>
              </ul>
            </div>
          ) : (
            <div className="carts-list">
              {pickupCarts.map((cart) => {
                const cartAddress = getCartAddress(cart);
                return (
                  <label
                    key={cart._id}
                    className={`cart-option ${
                      selectedCart?._id === cart._id ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="cart"
                      value={cart._id}
                      checked={selectedCart?._id === cart._id}
                      onChange={() => onCartChange(cart)}
                    />
                    <div className="cart-content">
                      <div className="cart-name">{getCartDisplayName(cart)}</div>
                      {cartAddress && (
                        <div className="cart-meta cart-meta-address">{cartAddress}</div>
                      )}
                      {typeof cart.distance === "number" && (
                        <div className="cart-meta">{cart.distance.toFixed(2)} km away</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrderTypeSelector;
