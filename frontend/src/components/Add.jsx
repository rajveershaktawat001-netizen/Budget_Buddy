import React, { useEffect, useRef, useState } from "react";
import { modalStyles } from "../assets/dummyStyles";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import QrScanner from "qr-scanner";
import qrScannerWorkerSource from "qr-scanner/qr-scanner-worker.min.js?url";
QrScanner.WORKER_PATH = qrScannerWorkerSource;

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
  onPaymentInitiate = null,
}) => {
  const [scanMessage, setScanMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [showPaymentOption, setShowPaymentOption] = useState(false);
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const qrScannerRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanFrameRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  // Get current date in YYYY-MM-DD format
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentDate = today.toISOString().split("T")[0];
  const minDate = `${currentYear}-01-01`;

  const colorClass = modalStyles.colorClasses[color];

  const stopCamera = () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (qrScannerRef.current) {
      qrScannerRef.current.destroy();
      qrScannerRef.current = null;
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

  const handleImageScan = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setScanMessage("Scanning image...");
    setIsScanning(true);

    try {
      const result = await QrScanner.scanImage(file);
      const parsed = parseQrData(result, newTransaction.category);
      setNewTransaction((prev) => ({
        ...prev,
        ...parsed,
      }));
      setScanMessage("QR scanned from image. Transaction fields were updated.");
      
      // Show payment option if amount is detected and payment handler exists
      if (parsed.amount && onPaymentInitiate) {
        setShowPaymentOption(true);
        setScanMessage("QR scanned! You can pay now or save as transaction.");
      }
    } catch (error) {
      console.error("Image scan failed:", error);
      setScanMessage("Could not scan QR code from image. Try taking a clearer photo.");
    } finally {
      setIsScanning(false);
      // Reset the input
      if (event.target) event.target.value = '';
    }
  };

  const openCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handlePaymentInitiate = () => {
    if (onPaymentInitiate && newTransaction.amount) {
      onPaymentInitiate(parseFloat(newTransaction.amount));
      setShowModal(false);
      setShowPaymentOption(false);
      setNewTransaction({
        description: "",
        amount: "",
        category: categories[0],
        type: type === "both" ? "expense" : type,
        date: currentDate,
      });
    }
  };

  const startCameraScan = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setScanMessage("Camera access is not available in this browser.");
      return;
    }

    if (!(await QrScanner.hasCamera())) {
      setScanMessage("No camera found.");
      return;
    }

    setScanMessage("");
    setIsScanning(true);
    setCameraActive(true);

    // Redirect to payment details after 5 seconds
    scanTimeoutRef.current = setTimeout(() => {
      stopCamera();
      setShowModal(false);
      navigate("/payment");
    }, 5000);

    // Delay to ensure video element is visible
    setTimeout(() => {
      try {
        const handleSuccess = (result) => {
          console.log("QR Code detected:", result);
          const qrValue = typeof result === 'string' ? result : (result.data || result);
          const parsed = parseQrData(qrValue, newTransaction.category);
          setNewTransaction((prev) => ({
            ...prev,
            ...parsed,
          }));
          setScanMessage("✅ QR scanned. Transaction fields were updated.");
          
          // Show payment option if amount is detected and payment handler exists
          if (parsed.amount && onPaymentInitiate) {
            setShowPaymentOption(true);
            setScanMessage("✅ QR scanned! You can pay now or save as transaction.");
          }
          
          stopCamera();
        };

        qrScannerRef.current = new QrScanner(
          videoRef.current,
          handleSuccess,
          {
            onDecodeError: (error) => {
              console.log("Scanning...");
            },
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
          }
        );

        qrScannerRef.current.start()
          .then(() => {
            console.log("QR Scanner started successfully");
            setScanMessage("📸 Scanning... Point your camera at a QR code");
          })
          .catch((error) => {
            console.error("Camera start failed:", error);
            setScanMessage(`❌ Camera error: ${error.message || 'Could not access camera'}`);
            stopCamera();
          });
      } catch (error) {
        console.error("QR Scanner setup failed:", error);
        setScanMessage(`❌ Setup failed: ${error.message}`);
        stopCamera();
      }
    }, 300);
  };

  useEffect(() => {
    if (!showModal) {
      stopCamera();
      setScanMessage("");
      setShowPaymentOption(false);
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
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageScan}
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
                {!cameraActive && (
                  <button
                    type="button"
                    onClick={openCameraCapture}
                    className={modalStyles.submitButton(colorClass.button)}
                  >
                    📸 Scan from Camera App
                  </button>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    display: cameraActive ? 'block' : 'none',
                    width: '100%',
                    height: '14rem',
                    objectFit: 'cover',
                  }}
                  className="rounded-lg border border-gray-200"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Scan a QR code live to auto-fill amount and description, or wait 5 seconds to proceed to payment manually.
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

            {showPaymentOption && newTransaction.amount && onPaymentInitiate && (
              <div className="mt-3 flex gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={handlePaymentInitiate}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  💳 Pay ${parseFloat(newTransaction.amount).toFixed(2)}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaymentOption(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Save Only
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransactionModal;
