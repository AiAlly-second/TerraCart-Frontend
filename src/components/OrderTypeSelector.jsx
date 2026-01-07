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

  // Reverse geocoding: Convert coordinates to formatted address
  const reverseGeocode = async (latitude, longitude) => {
    try {
      setFetchingAddress(true);
      // Using OpenStreetMap Nominatim (free, no API key required)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'TerraCart-Ordering-System' // Required by Nominatim
          }
        }
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch address");
      }

      const data = await response.json();
      
      if (data && data.address) {
        const addr = data.address;
        // Format address in Indian style: Building/Place, Street, City, State - ZipCode
        // Example: "Gnamaste Hotel, Dindory Road, Nashik - 4200111"
        const parts = [];
        
        // Building name, house name, or place (priority order)
        if (addr.building) {
          parts.push(addr.building);
        } else if (addr.house_name) {
          parts.push(addr.house_name);
        } else if (addr.house_number) {
          // Only add house number if there's no building/house name
          const houseNum = addr.house_number.trim();
          if (houseNum) {
            parts.push(houseNum);
          }
        }
        
        // Street/Road
        if (addr.road) {
          parts.push(addr.road);
        }
        
        // City/Town/Village (priority order)
        if (addr.city) {
          parts.push(addr.city);
        } else if (addr.town) {
          parts.push(addr.town);
        } else if (addr.village) {
          parts.push(addr.village);
        }
        
        // State and ZipCode together: "State - ZipCode"
        if (addr.state) {
          if (addr.postcode) {
            parts.push(`${addr.state} - ${addr.postcode}`);
          } else {
            parts.push(addr.state);
          }
        } else if (addr.postcode) {
          // If no state but has postcode, just add postcode
          parts.push(addr.postcode);
        }
        
        // Join all parts with commas
        let formattedAddress = parts.join(", ");
        
        // Fallback to display_name if formatting fails or is empty
        if (!formattedAddress || formattedAddress.trim().length === 0) {
          formattedAddress = data.display_name || "Address not available";
        }
        
        return formattedAddress;
      }
      
      return data.display_name || "Address not available";
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      return null; // Return null if geocoding fails
    } finally {
      setFetchingAddress(false);
    }
  };

  // Get user's current location
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
        
        // Get formatted address from coordinates
        const formattedAddress = await reverseGeocode(latitude, longitude);
        
        const location = {
          latitude: latitude,
          longitude: longitude,
          address: formattedAddress || manualAddress || "Location coordinates captured",
        };
        
        // Update manual address field with the formatted address
        if (formattedAddress) {
          setManualAddress(formattedAddress);
        }
        
        onLocationChange(location);
      },
      (error) => {
        setLocationError("Unable to get your location. Please enter manually.");
        setFetchingAddress(false);
        console.error("Geolocation error:", error);
      }
    );
  };

  // Fetch nearby carts when location is available
  useEffect(() => {
    if (customerLocation?.latitude && customerLocation?.longitude) {
      // This will be handled by parent component
    }
  }, [customerLocation]);

  return (
    <div className="order-type-selector">
      <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1rem", color: "#333" }}>
        {texts.title || "Choose Order Type"}
      </h3>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Pickup Option */}
        <label
          className={`order-type-option flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 h-full ${
            selectedType === "PICKUP"
              ? "border-orange-500 bg-orange-50"
              : "border-gray-200 hover:border-orange-200 hover:bg-gray-50"
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
          <FaStore
            className={`text-3xl mb-3 ${
              selectedType === "PICKUP" ? "text-orange-500" : "text-gray-400"
            }`}
          />
          <div className="font-bold text-gray-800 text-lg mb-1">{texts.pickupOption || "Pickup"}</div>
          <div className="text-xs text-gray-500 text-center leading-tight">
            {texts.pickupDesc || "Order and collect from store"}
          </div>
        </label>

        {/* Delivery Option */}
        <label
          className={`order-type-option flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 h-full ${
            selectedType === "DELIVERY"
              ? "border-orange-500 bg-orange-50"
              : "border-gray-200 hover:border-orange-200 hover:bg-gray-50"
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
          <FaTruck
            className={`text-3xl mb-3 ${
              selectedType === "DELIVERY" ? "text-orange-500" : "text-gray-400"
            }`}
          />
          <div className="font-bold text-gray-800 text-lg mb-1">{texts.deliveryOption || "Delivery"}</div>
          <div className="text-xs text-gray-500 text-center leading-tight">
            {texts.deliveryDesc || "Get your order delivered"}
          </div>
        </label>
      </div>

      {/* Location Capture */}
      {(selectedType === "PICKUP" || selectedType === "DELIVERY") && (
        <div className="location-section mb-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <FaMapMarkerAlt className="text-red-500" />
            Your Location
          </h4>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={getCurrentLocation}
              className="btn-location"
              disabled={fetchingAddress}
            >
              {fetchingAddress ? "📍 Fetching location..." : "📍 Use Current Location"}
            </button>

            <input
              type="text"
              placeholder="Enter your address or 6-digit pin code"
              value={manualAddress}
              onChange={(e) => {
                const addressValue = e.target.value;
                setManualAddress(addressValue);
                // For manual address, only set address without coordinates
                // This will trigger showing all available carts instead of location-based fetching
                if (addressValue.trim()) {
                  onLocationChange({
                    address: addressValue,
                    // Don't include latitude/longitude for manual addresses
                    // This signals that we should show all available carts
                  });
                } else {
                  // Clear location if address is empty
                  onLocationChange(null);
                }
              }}
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Tip: You can enter just your 6-digit pin code for faster location detection
            </p>

            {locationError && (
              <p className="text-red-500 text-sm">{locationError}</p>
            )}

            {customerLocation && (
              <div className="location-info" style={{ 
                padding: "0.75rem", 
                background: "#f0f9ff", 
                borderRadius: "0.5rem",
                border: "1px solid #bae6fd"
              }}>
                <p className="text-sm font-medium text-gray-800 mb-1">
                  📍 Your Location:
                </p>
                <p className="text-sm text-gray-700">
                  {customerLocation.address || "Location set"}
                </p>
                {customerLocation.latitude && customerLocation.longitude && (
                  <p className="text-xs text-gray-500 mt-1">
                    Coordinates: {customerLocation.latitude.toFixed(6)}, {customerLocation.longitude.toFixed(6)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nearby Carts Selection (for Delivery) */}
      {/* Only show carts for DELIVERY if location has GPS coordinates (within delivery range) */}
      {selectedType === "DELIVERY" && customerLocation && customerLocation.latitude && customerLocation.longitude && (
        <div className="nearby-carts-section">
          <h4 className="font-medium mb-2">Available Stores</h4>
          {loading ? (
            <p className="text-sm text-gray-600">Loading nearby stores...</p>
          ) : nearbyCarts.length === 0 ? (
            <div className="text-sm text-red-600 p-2 bg-red-50 rounded">
              <p className="font-semibold">No stores available for delivery in your area</p>
              <p className="text-xs mt-1">All stores are outside the delivery radius for your location.</p>
              <p className="text-xs mt-2 text-blue-600">💡 Try selecting "Pickup" instead, or enter a different address</p>
            </div>
          ) : (
            <div className="carts-list">
              {nearbyCarts.map((cart) => (
                <label
                  key={cart._id}
                  className="cart-option"
                >
                  <input
                    type="radio"
                    name="cart"
                    value={cart._id}
                    checked={selectedCart?._id === cart._id}
                    onChange={() => onCartChange(cart)}
                    className="mr-2"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{cart.name}</div>
                    {cart.distance !== null && (
                      <div className="text-sm text-gray-600">
                        {cart.distance.toFixed(2)} km away
                      </div>
                    )}
                    {cart.deliveryInfo && (
                      <div className="text-sm text-green-600">
                        Delivery: ₹{cart.deliveryInfo.deliveryCharge} •{" "}
                        {cart.deliveryInfo.estimatedTime} min
                        {cart.deliveryInfo.distance && (
                          <span> • {cart.deliveryInfo.distance.toFixed(2)} km</span>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cart Selection (for Pickup) */}
      {selectedType === "PICKUP" && customerLocation && (
        <div className="pickup-carts-section">
          <h4 className="font-medium mb-2">Select Store</h4>
          {loading ? (
            <p className="text-sm text-gray-600">Loading stores...</p>
          ) : nearbyCarts.length === 0 ? (
            <div className="text-sm text-yellow-600 p-2 bg-yellow-50 rounded">
              <p className="font-semibold">No stores available</p>
              <p className="text-xs mt-1">Please ensure:</p>
              <ul className="text-xs list-disc list-inside mt-1">
                <li>At least one cart exists in the system</li>
                <li>Carts have pickup enabled</li>
                <li>Backend server is running</li>
              </ul>
            </div>
          ) : (
            <div className="carts-list">
              {nearbyCarts
                .filter((cart) => cart.pickupEnabled)
                .map((cart) => (
                  <label key={cart._id} className="cart-option">
                    <input
                      type="radio"
                      name="cart"
                      value={cart._id}
                      checked={selectedCart?._id === cart._id}
                      onChange={() => onCartChange(cart)}
                      className="mr-2"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{cart.name}</div>
                      {cart.address?.fullAddress && (
                        <div className="text-sm text-gray-600">
                          {cart.address.fullAddress}
                        </div>
                      )}
                      {cart.distance !== null && (
                        <div className="text-sm text-gray-500">
                          {cart.distance.toFixed(2)} km away
                        </div>
                      )}
                    </div>
                  </label>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrderTypeSelector;

