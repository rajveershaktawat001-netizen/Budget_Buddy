import React, { useEffect, useRef, useState } from "react";
import { modalStyles } from "../assets/dummyStyles";
import { X } from "lucide-react";

const parseQrData = (rawValue, fallbackCategory) => {
  const nextState = {};

  try {
    if (rawValue.startsWith("upi://")) {
      const url = new URL(rawValue);
      const payeeName = url.searchParams.get("pn");
      const payeeAddress = url.searchParams.get("pa");
      const amount = url.searchParams.get("am");
      const note = url.searchParams.get("tn");
      const merchantCode = url.searchParams.get("mc");

      nextState.description =
        payeeName || note || payeeAddress || "QR payment";
      nextState.amount = amount || "";
      nextState.category =
        merchantCode === "5411" ? "Food" : fallbackCategory || "Other";
      nextState.type = "expense";
      return nextState;
    }

    if (rawValue.startsWith("{")) {
      const parsed = JSON.parse(rawValue);
      nextState.description =
        parsed.description || parsed.name || parsed.payee || "QR payment";
      nextState.amount = parsed.amount || "";
      nextState.category = parsed.category || fallbackCategory || "Other";
      if (parsed.type) nextState.type = parsed.type;
      return nextState;
    }
  } catch {
    // Fall through to plain-text parsing.
  }

  nextState.description = rawValue.slice(0, 80);
  return nextState;
};

const AddTransactionModal = ({
  showModal,
  setShowModal,
  newTransaction,
  setNewTransaction,
  handleAddTransaction,
  type = "both",
  title = "Add New Transaction",
  buttonText = "Add Transaction",
  categories = [
    "Food",
    "Housing",
    "Transport",
    "Shopping",
    "Entertainment",
    "Utilities",
    "Healthcare",
    "Salary",
    "Freelance",
    "Investments",
    "Bonus",
    "Other",
  ],
  color = "teal",
}) => {
  const [scanMessage, setScanMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const scanFrameRef = useRef(null);

  // Get current date in YYYY-MM-DD format
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentDate = today.toISOString().split("T")[0];
  const minDate = `${currentYear}-01-01`;

  const colorClass = modalStyles.colorClasses[color];

  const stopCamera = () => {
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const scanVideoFrame = async () => {
    if (!videoRef.current || !detectorRef.current || !cameraActive) {
      return;
    }

    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes.length && codes[0].rawValue) {
        const parsed = parseQrData(codes[0].rawValue, newTransaction.category);
        setNewTransaction((prev) => ({
          ...prev,
          ...parsed,
        }));
        setScanMessage("QR scanned. Transaction fields were updated.");
        stopCamera();
        return;
      }
    } catch (error) {
      console.error("QR scan failed:", error);
      setScanMessage("Could not scan the live camera feed.");
      stopCamera();
      return;
    }

    scanFrameRef.current = requestAnimationFrame(scanVideoFrame);
  };

  const startCameraScan = async () => {
    if (
      typeof window === "undefined" ||
      typeof window.BarcodeDetector === "undefined"
    ) {
      setScanMessage("QR scanning is not supported in this browser.");
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setScanMessage("Camera access is not available in this browser.");
      return;
    }

    try {
      setScanMessage("");
      setIsScanning(true);

      detectorRef.current = new window.BarcodeDetector({
        formats: ["qr_code"],
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      scanFrameRef.current = requestAnimationFrame(scanVideoFrame);
    } catch (error) {
      console.error("Camera start failed:", error);
      setScanMessage("Could not access the camera.");
      stopCamera();
    }
  };

  useEffect(() => {
    if (!showModal) {
      stopCamera();
      setScanMessage("");
    }
  }, [showModal]);

  useEffect(() => {
    if (!cameraActive) {
      setIsScanning(false);
    }
  }, [cameraActive]);

  if (!showModal) return null;

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.modalContainer}>
        <div className={modalStyles.modalHeader}>
          <h3 className={modalStyles.modalTitle}>{title}</h3>
          <button
            onClick={() => setShowModal(false)}
            className={modalStyles.closeButton}
          >
            <X size={24} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddTransaction();
          }}
        >
          <div className={modalStyles.form}>
            <div>
              <label className={modalStyles.label}>Scan QR</label>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={cameraActive ? stopCamera : startCameraScan}
                  className={modalStyles.submitButton(colorClass.button)}
                >
                  {cameraActive ? "Stop Camera" : "Start Live Scanner"}
                </button>
                {cameraActive && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-56 w-full rounded-lg border border-gray-200 object-cover"
                  />
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Scan a QR code live to auto-fill amount and description.
              </p>
              {scanMessage && (
                <p className="mt-2 text-xs text-teal-600">{scanMessage}</p>
              )}
            </div>

            <div>
              <label className={modalStyles.label}>Description</label>
              <input
                type="text"
                value={newTransaction.description}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
                placeholder={
                  type === "both"
                    ? "Salary, Funds, etc."
                    : "Groceries, Rent, etc."
                }
                required
              />
            </div>

            <div>
              <label className={modalStyles.label}>Amount</label>
              <input
                type="number"
                value={newTransaction.amount}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    amount: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
                placeholder="0.00"
                required
              />
            </div>

            {type === "both" && (
              <div>
                <label className={modalStyles.label}>Type</label>
                <div className={modalStyles.typeButtonContainer}>
                  <button
                    type="button"
                    className={modalStyles.typeButton(
                      newTransaction.type === "income",
                      modalStyles.colorClasses.teal.typeButtonSelected,
                    )}
                    onClick={() =>
                      setNewTransaction((prev) => ({ ...prev, type: "income" }))
                    }
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    className={modalStyles.typeButton(
                      newTransaction.type === "expense",
                      modalStyles.colorClasses.orange.typeButtonSelected,
                    )}
                    onClick={() =>
                      setNewTransaction((prev) => ({
                        ...prev,
                        type: "expense",
                      }))
                    }
                  >
                    Expense
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className={modalStyles.label}>Category</label>
              <select
                value={newTransaction.category}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
              >
                {categories.map((cat) => (
                  <option value={cat} key={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={modalStyles.label}>Date</label>
              <input
                type="date"
                value={newTransaction.date}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
                min={minDate}
                max={currentDate}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isScanning}
              className={modalStyles.submitButton(colorClass.button)}
            >
              {isScanning ? "Scanning..." : buttonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransactionModal;
