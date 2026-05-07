import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Send, CheckCircle } from "lucide-react";
import { modalStyles } from "../assets/dummyStyles"; // Using existing styles if needed, or custom tailwind

const Payment = ({ addTransaction }) => {
  const navigate = useNavigate();
  const [paymentDetails, setPaymentDetails] = useState({
    payee: "",
    upiId: "",
    amount: "",
    note: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handlePayment = (e) => {
    e.preventDefault();
    setIsProcessing(true);
    
    // Simulate payment processing
    setTimeout(() => {
      // Add transaction
      if (addTransaction && paymentDetails.amount) {
        addTransaction({
          id: Date.now().toString(),
          description: `Payment to ${paymentDetails.payee || paymentDetails.upiId} ${paymentDetails.note ? `(${paymentDetails.note})` : ''}`,
          amount: parseFloat(paymentDetails.amount),
          category: "Other",
          type: "expense",
          date: new Date().toISOString().split("T")[0],
        });
      }
      
      setIsProcessing(false);
      setIsSuccess(true);
      
      setTimeout(() => {
        navigate("/");
      }, 2000);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition"
        >
          <ArrowLeft size={24} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-semibold text-gray-800">Make a Payment</h1>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 flex justify-center items-start">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-teal-500 p-6 text-white">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/20 p-4 rounded-full">
                <CreditCard size={48} />
              </div>
            </div>
            <h2 className="text-center text-2xl font-bold">Secure Payment</h2>
            <p className="text-center text-blue-100 mt-1">Enter payment details to proceed</p>
          </div>

          {isSuccess ? (
            <div className="p-8 flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-500">
              <CheckCircle size={80} className="text-green-500" />
              <h3 className="text-2xl font-bold text-gray-800">Payment Successful!</h3>
              <p className="text-gray-500 text-center">Your transaction has been recorded.</p>
              <p className="text-sm text-gray-400 mt-4">Redirecting to dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handlePayment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payee Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={paymentDetails.payee}
                  onChange={(e) => setPaymentDetails({...paymentDetails, payee: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID / Account Info</label>
                <input
                  type="text"
                  required
                  placeholder="john@upi"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={paymentDetails.upiId}
                  onChange={(e) => setPaymentDetails({...paymentDetails, upiId: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-lg font-semibold"
                  value={paymentDetails.amount}
                  onChange={(e) => setPaymentDetails({...paymentDetails, amount: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  placeholder="What is this for?"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  value={paymentDetails.note}
                  onChange={(e) => setPaymentDetails({...paymentDetails, note: e.target.value})}
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-lg transition ${
                  isProcessing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    Pay Now
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Payment;
