import React from "react";
import { useNavigate } from "react-router-dom";
import { Luggage, Route, ArrowRight, Check, Sparkles, MapPin, CalendarDays, SlidersHorizontal } from "lucide-react";
import { Modal, Button, Badge } from "./ui";

export default function NewTripModal({ isOpen, onClose }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  function choose(type) {
    onClose();
    navigate(`/trips/new?type=${type}`);
  }

  return (
    <Modal title="Start a New Journey" onClose={onClose}>
      <div className="new-trip-modal-content">
        <p className="new-trip-modal-subtitle">
          Select how you want to configure this journey. Choose a multi-day package itinerary or an on-demand custom route.
        </p>

        <div className="new-trip-options-grid">
          {/* Option 1: Package Trip */}
          <div
            className="new-trip-card package"
            role="button"
            tabIndex={0}
            onClick={() => choose("package")}
            onKeyDown={(e) => e.key === "Enter" && choose("package")}
          >
            <div className="new-trip-card-header">
              <div className="option-number-badge">OPTION 1</div>
              <span className="badge" style={{ background: "#ecfdf5", color: "#065f46", borderColor: "#a7f3d0" }}>
                Multi-Day Package
              </span>
            </div>

            <div className="new-trip-card-hero">
              <div className="new-trip-card-icon package-icon">
                <Luggage size={26} />
              </div>
              <div>
                <h3>Package Trip</h3>
                <p className="card-subhead">Tour packages & multi-day holiday itineraries</p>
              </div>
            </div>

            <p className="new-trip-card-desc">
              Ideal for holiday tours, multi-day sightseeing circuits, and fixed packages with day-wise itineraries and package rates.
            </p>

            <ul className="new-trip-card-features">
              <li>
                <Check size={15} />
                <span>Multi-day schedule with daily destinations</span>
              </li>
              <li>
                <Check size={15} />
                <span>Popular tour templates (Kerala, Ooty, Goa, etc.)</span>
              </li>
              <li>
                <Check size={15} />
                <span>Package-per-day or all-inclusive pricing</span>
              </li>
              <li>
                <Check size={15} />
                <span>Driver Day Mode & GPS sightseeing logs</span>
              </li>
            </ul>

            <Button
              type="button"
              className="w-full new-trip-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                choose("package");
              }}
            >
              <span>Select Package Trip</span>
              <ArrowRight size={16} />
            </Button>
          </div>

          {/* Option 2: Custom Trip */}
          <div
            className="new-trip-card custom"
            role="button"
            tabIndex={0}
            onClick={() => choose("custom")}
            onKeyDown={(e) => e.key === "Enter" && choose("custom")}
          >
            <div className="new-trip-card-header">
              <div className="option-number-badge">OPTION 2</div>
              <span className="badge" style={{ background: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1" }}>
                Point-to-Point
              </span>
            </div>

            <div className="new-trip-card-hero">
              <div className="new-trip-card-icon custom-icon">
                <Route size={26} />
              </div>
              <div>
                <h3>Custom Trip</h3>
                <p className="card-subhead">On-demand rentals, transfers & custom routes</p>
              </div>
            </div>

            <p className="new-trip-card-desc">
              Ideal for airport pickups, direct point-to-point journeys, outstation trips, and hourly rentals with flexible stops.
            </p>

            <ul className="new-trip-card-features">
              <li>
                <Check size={15} />
                <span>Flexible pickup (From) & drop (To) routing</span>
              </li>
              <li>
                <Check size={15} />
                <span>Custom intermediate places & stop readings</span>
              </li>
              <li>
                <Check size={15} />
                <span>Per KM, hourly, or fixed billing methods</span>
              </li>
              <li>
                <Check size={15} />
                <span>Single-step odometer & time tracking</span>
              </li>
            </ul>

            <Button
              type="button"
              variant="secondary"
              className="w-full new-trip-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                choose("custom");
              }}
            >
              <span>Select Custom Trip</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
