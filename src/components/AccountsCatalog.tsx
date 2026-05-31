import React, { useState, useEffect } from "react";
import { Check, Coins, Trophy, Car, Map, ShieldCheck, Mail, Loader2, Sparkles, QrCode, UploadCloud, Copy, ArrowRight, ArrowLeft, KeyRound, ExternalLink, RefreshCw } from "lucide-react";
import { CarXAccount } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface AccountsCatalogProps {
  onNavigate: (view: string, arg?: string) => void;
}

export default function AccountsCatalog({ onNavigate }: AccountsCatalogProps) {
  const [accounts, setAccounts] = useState<CarXAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GCash instructions settings
  const [gcashSettings, setGcashSettings] = useState({
    gcash_number: "09123456789",
    gcash_qr_url: "https://pub-c2a2b0c3f0b2.r2.dev/gcash_qr_sample.png"
  });

  // Modal steps: "credentials" | "pay_instructions" | "upload_receipt" | "cloning_loader" | "delivery_panel"
  const [selectedAccount, setSelectedAccount] = useState<CarXAccount | null>(null);
  const [modalStep, setModalStep] = useState<"credentials" | "pay_instructions" | "upload_receipt" | "cloning_loader" | "delivery_panel">("credentials");
  const [customerEmail, setCustomerEmail] = useState("");
  const [carxEmail, setCarxEmail] = useState("");
  const [carxPassword, setCarxPassword] = useState("");
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  
  // Deliver results
  const [currentOrderId, setCurrentOrderId] = useState("");
  const [deliveredEmail, setDeliveredEmail] = useState("");
  const [deliveredPassword, setDeliveredPassword] = useState("");
  const [copied, setCopied] = useState(false);

  // Load configuration
  useEffect(() => {
    async function initCatalog() {
      try {
        setLoading(true);
        // Load settings
        const settingsResp = await fetch("/api/settings");
        if (settingsResp.ok) {
          const s = await settingsResp.json();
          setGcashSettings({
            gcash_number: s.gcash_number || "09123456789",
            gcash_qr_url: s.gcash_qr_url || "https://pub-c2a2b0c3f0b2.r2.dev/gcash_qr_sample.png"
          });
        }

        // Load accounts
        const accountsResp = await fetch("/api/accounts");
        if (!accountsResp.ok) {
          throw new Error("Failed to load resource package listings.");
        }
        const data = await accountsResp.json();
        setAccounts(data);
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    }
    initCatalog();
  }, []);

  const handleOpenCheckoutModal = (acc: CarXAccount) => {
    setSelectedAccount(acc);
    setModalStep("credentials");
    setCustomerEmail("");
    setCarxEmail("");
    setCarxPassword("");
    setOcrError(null);
    setReceiptBase64(null);
  };

  const handleCloseCheckoutModal = () => {
    setSelectedAccount(null);
    setCustomerEmail("");
    setCarxEmail("");
    setCarxPassword("");
    setReceiptBase64(null);
    setOcrError(null);
    setCurrentOrderId("");
    setDeliveredEmail("");
    setDeliveredPassword("");
  };

  // Convert File to Base64
  const processReceiptFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setOcrError("Please upload a valid receipt screenshot image (PNG, JPEG, etc)");
      return;
    }
    setOcrError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processReceiptFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processReceiptFile(e.target.files[0]);
    }
  };

  // Step 1: Submit Credentials
  const submitCredentialsStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail || !customerEmail.includes("@")) {
      setOcrError("Please input active delivery email coordinates.");
      return;
    }
    if (!carxEmail) {
      setOcrError("Please input your CarX login email/username.");
      return;
    }
    if (!carxPassword) {
      setOcrError("Please input your CarX account password.");
      return;
    }
    setOcrError(null);
    setModalStep("pay_instructions");
  };

  // Step 3: Trigger AI verification & account delivery sequence
  const verifyGCashReceiptOCR = async () => {
    if (!receiptBase64 || !selectedAccount) {
      setOcrError("Please drag or snap a snapshot file of the GCash payment receipt.");
      return;
    }

    try {
      setVerifyingPayment(true);
      setOcrError(null);

      // 1. Analyze receipt via OCR Endpoint
      const analyzeResp = await fetch("/api/analyze-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Image: receiptBase64,
          expectedAmount: selectedAccount.price
        })
      });

      const ocrResult = await analyzeResp.json();
      if (!analyzeResp.ok || !ocrResult.success) {
        throw new Error(ocrResult.error || "Receipt credentials validation failed. Please check snapshot readability.");
      }

      // 2. Receipt verified! Create a pending order in DB
      const orderResp = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_type: "account",
          customer_email: customerEmail,
          carx_email: carxEmail,
          carx_password: carxPassword,
          account_id: selectedAccount.id,
          amount_paid: selectedAccount.price,
          gcash_ref_number: ocrResult.data.reference_number,
          gcash_receipt_data: ocrResult.data,
          status: "paid"
        })
      });

      const orderResult = await orderResp.json();
      if (!orderResp.ok || !orderResult.success) {
        throw new Error(orderResult.error || "Failed registering order index block.");
      } 

      const generatedOrderId = orderResult.order.order_id;
      setCurrentOrderId(generatedOrderId);

      // Transition to Loader Step
      setModalStep("cloning_loader");

      // 3. Trigger Automatic Cloner API Call
      const cloneResp = await fetch("/api/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: generatedOrderId
        })
      });

      const cloneResult = await cloneResp.json();
      if (!cloneResp.ok || !cloneResult.success) {
        throw new Error(cloneResult.error || "The cloner pipeline encountered an issue. Safe synchronization backup queued.");
      }

      // Successfully Cloned! Store credentials and display delivery screen
      setDeliveredEmail(cloneResult.delivered_email);
      setDeliveredPassword(cloneResult.delivered_password);
      setModalStep("delivery_panel");

    } catch (err: any) {
      setOcrError(err.message || "Network exception parsing. Please retry receipt submission.");
      setModalStep("upload_receipt"); // Safely revert to upload stage if validation fails
    } finally {
      setVerifyingPayment(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-10" id="catalog-view">
      
      {/* Page Header */}
      <div className="text-center md:text-left mb-12">
        <h1 className="text-3xl md:text-5xl font-display font-black tracking-tight mb-4 text-white uppercase italic">
          RESOURCE <span className="text-[#FFD700]">PACKAGES</span>
        </h1>
        <p className="text-zinc-500 font-sans max-w-2xl text-xs md:text-sm">
          All packages undergo multi-phase secure verification, completely safe from server bans, and are directly injected into your own provided CarX details. Select your garage package below.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-[#0A0A0A] border border-[#1A1A1A] rounded p-8">
          <Loader2 className="w-8 h-8 animate-spin text-[#FFD700]" />
          <p className="font-mono text-[10px] text-zinc-500 tracking-wider">LOADING LIVE ACCOUNT GARAGE SUPPLIES...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded bg-[#FF3333]/10 border border-[#FF3333]/20 text-center max-w-xl mx-auto mb-10 font-mono text-xs">
          <p className="text-red-400 mb-2 font-bold uppercase">STOCK INDEX FAILURE</p>
          <p className="text-zinc-400">{error}</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="p-12 text-center rounded bg-[#0A0A0A] border border-dashed border-[#222] max-w-2xl mx-auto">
          <Sparkles className="w-10 h-10 text-[#FFD700] mx-auto mb-4 animate-pulse" />
          <h3 className="font-display font-black text-xl mb-2 text-white italic uppercase tracking-tight">GARAGE SELECTION SOLD OUT</h3>
          <p className="text-zinc-400 text-xs mb-6 max-w-md mx-auto leading-relaxed">
            Our reseller networks have cleared catalog segments today. Check back inside 1-2 hours or construct a tailor-made patch injection on your existing racer account!
          </p>
          <button
            onClick={() => onNavigate("order")}
            className="px-6 py-3 bg-[#FF3333] hover:bg-white text-white hover:text-black font-black uppercase text-xs tracking-wider transition-colors cursor-pointer"
          >
            ORDER RESOURCE INJECTION
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" id="catalog-grid">
          {accounts.map((acc, index) => (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.04 }}
              key={acc.id}
              className="group relative rounded bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#FFD700] transition-colors flex flex-col justify-between p-6"
              id={`account-card-${acc.id}`}
            >
              {/* Card visual banner & Header info */}
              <div className="flex justify-between items-start mb-6 border-b border-[#1A1A1A] pb-4">
                <div>
                  <span className="text-[9px] font-mono tracking-widest text-emerald-400 bg-emerald-500/5 px-2 py-0.5 border border-emerald-500/10 rounded-sm inline-block mb-1.5 uppercase font-bold">
                    Level {acc.xp} XP
                  </span>
                  <h4 className="text-lg font-bold uppercase italic tracking-tighter text-white group-hover:text-[#FFD700] transition-colors">
                    {acc.name}
                  </h4>
                </div>
                <span className="text-[#FFD700] font-mono text-xl font-bold tracking-tight">
                  ₱{Number(acc.price).toFixed(2)}
                </span>
              </div>

              {/* Statistical features using Sleek theme's metadata grid */}
              <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-[10px] uppercase font-bold tracking-widest font-mono text-zinc-500 mb-6">
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[9px] text-zinc-600">SILVER WALLET</span>
                  <span className="text-white text-sm font-sans tracking-tight font-bold">
                    {acc.silver >= 1000000 ? `${(acc.silver / 1000000).toFixed(1)}M` : acc.silver.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="mb-0.5 text-[9px] text-zinc-600">GOLD COPIES</span>
                  <span className="text-[#FFD700] text-sm font-sans tracking-tight font-bold">
                    {acc.gold >= 1000 ? `${(acc.gold / 1000).toFixed(1)}K` : acc.gold.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="mb-0.5 text-[9px] text-zinc-600">UNLOCKED CARS</span>
                  <span className="text-white text-sm font-sans tracking-tight font-bold">{acc.cars_unlocked} CARS</span>
                </div>

                <div className="flex flex-col">
                  <span className="mb-0.5 text-[9px] text-zinc-600">MAP DISCOVERIES</span>
                  <span className="text-white text-sm font-sans tracking-tight font-bold">
                    {acc.maps_unlocked >= 10 ? "ALL MAPS" : `${acc.maps_unlocked} REGIONS`}
                  </span>
                </div>
              </div>

              {/* Bottom Trigger Action button */}
              <button
                onClick={() => handleOpenCheckoutModal(acc)}
                className="w-full py-2.5 bg-black hover:bg-[#FFD700] border border-[#222] hover:border-[#FFD700] text-[#E0E0E0] hover:text-black text-[10px] uppercase tracking-widest font-mono font-bold rounded-sm transition-all text-center cursor-pointer"
                id={`buy-btn-${acc.id}`}
              >
                Buy Instantly
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Interactive GCash Cloner Modal */}
      <AnimatePresence>
        {selectedAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={verifyGCashReceiptOCR ? undefined : handleCloseCheckoutModal}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              className="relative w-full max-w-lg rounded bg-black border border-zinc-800 p-6 md:p-8 overflow-hidden"
              id="gcash-payment-modal"
            >
              {/* Header Title bar */}
              <div className="flex justify-between items-start mb-6 border-b border-zinc-900 pb-4">
                <div>
                  <span className="font-mono text-[9px] font-bold text-gray-500 uppercase tracking-wider block">
                    MODDED REPLICA CLONER
                  </span>
                  <h3 className="font-display font-black italic uppercase text-lg text-white">
                    {modalStep === "cloning_loader" ? "INJECTING METADATA..." : "GCASH AUTO-DELIVERY COCKPIT"}
                  </h3>
                </div>
                {modalStep !== "cloning_loader" && (
                  <button
                    onClick={handleCloseCheckoutModal}
                    className="p-1 px-2.5 rounded bg-[#111] border border-zinc-800 text-zinc-500 hover:text-white font-mono text-xs cursor-pointer"
                  >
                    CLOSE
                  </button>
                )}
              </div>

              {/* STEP 1: CREDENTIALS COLLECTION */}
              {modalStep === "credentials" && (
                <form onSubmit={submitCredentialsStep} className="space-y-5">
                  <div className="p-4 bg-zinc-950 border border-zinc-900 rounded space-y-1 text-xs">
                    <p className="text-white font-bold uppercase font-mono text-[10px] text-[#FFD700]">GARAGE SELECTION OVERVIEW</p>
                    <div className="flex justify-between pt-1">
                      <span className="text-zinc-400 font-bold uppercase">{selectedAccount.name}</span>
                      <strong className="text-white font-mono">₱{Number(selectedAccount.price).toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Delivery email */}
                  <div className="space-y-1.5">
                    <label htmlFor="modal-customer-email" className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono text-left">
                      Delivery / Status Update Email <span className="text-[#FF3333]">*</span>
                    </label>
                    <input
                      id="modal-customer-email"
                      type="email"
                      required
                      placeholder="customer@gmail.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-805 border-zinc-800 p-2.5 rounded text-sm text-white focus:outline-none focus:border-[#FFD700] font-mono transition-colors"
                    />
                    <span className="text-[9px] text-zinc-500 block leading-tight text-left">
                      * Status changes, tracking alerts, and confirmation reports will send here.
                    </span>
                  </div>

                  {/* CarX login email/username */}
                  <div className="space-y-1.5">
                    <label htmlFor="modal-carx-email" className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono text-left">
                      CarX Login Email / Username ID <span className="text-[#FF3333]">*</span>
                    </label>
                    <input
                      id="modal-carx-email"
                      type="text"
                      required
                      placeholder="player_username"
                      value={carxEmail}
                      onChange={(e) => setCarxEmail(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-805 border-zinc-800 p-2.5 rounded text-sm text-white focus:outline-none focus:border-[#FFD700] font-mono transition-colors"
                    />
                  </div>

                  {/* CarX Password */}
                  <div className="space-y-1.5">
                    <label htmlFor="modal-carx-password" className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono text-left">
                      CarX Account Password <span className="text-[#FF3333]">*</span>
                    </label>
                    <input
                      id="modal-carx-password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={carxPassword}
                      onChange={(e) => setCarxPassword(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-805 border-zinc-800 p-2.5 rounded text-sm text-white focus:outline-none focus:border-[#FFD700] font-mono transition-colors"
                    />
                    <span className="text-[9px] text-zinc-500 block leading-tight text-left">
                      * Required to verify and inject progression data directly through CarX Street servers.
                    </span>
                  </div>

                  {ocrError && (
                    <p className="text-xs text-[#FF3333] font-mono leading-relaxed bg-[#FF3333]/5 border border-[#FF3333]/15 p-2 rounded text-left">
                      ⚠ {ocrError}
                    </p>
                  )}

                  <div className="flex gap-4 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseCheckoutModal}
                      className="w-1/2 py-2.5 bg-black hover:bg-[#111] text-zinc-500 hover:text-white font-mono text-xs uppercase border border-zinc-800"
                    >
                      CANCEL
                    </button>
                    
                    <button
                      type="submit"
                      className="w-1/2 py-2.5 bg-[#FFD700] hover:bg-white text-black font-black uppercase tracking-wider font-mono text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>NEXT: PAY VIA GCASH</span>
                      <ArrowRight className="w-3.5 h-3.5 text-black" />
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2: GCASH STEPS */}
              {modalStep === "pay_instructions" && (
                <div className="space-y-6">
                  <div className="bg-zinc-950 border border-zinc-900 rounded p-4 text-[11px] leading-relaxed text-zinc-300 space-y-2">
                    <p className="font-bold text-[#FFD700] text-xs font-mono uppercase">MANUAL GCASH STEPS</p>
                    <p>1. Open GCash app and select <strong className="text-white">"Send Money" &gt; "Express Send"</strong> or scan the QR Code below.</p>
                    <p>2. Send the exact amount representing <strong className="text-white">₱{Number(selectedAccount.price).toFixed(2)} PHP</strong> to the Account details below.</p>
                    <p>3. <strong className="text-[#FFD700]">CRITICAL: Save/screenshot the transaction receipt receipt screen!</strong> You will upload it next.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-center bg-black border border-zinc-900 p-4 rounded-sm">
                    <div className="space-y-2">
                      <span className="block text-[9px] font-mono text-zinc-600 font-bold uppercase text-left">GCash Receiver</span>
                      <div className="p-2 bg-zinc-950 text-white font-mono text-sm border border-zinc-850 rounded flex items-center justify-between">
                        <span>{gcashSettings.gcash_number}</span>
                        <button
                          onClick={() => handleCopy(gcashSettings.gcash_number)}
                          className="text-[#FFD700] hover:text-white text-[9px] font-semibold uppercase"
                        >
                          COPY
                        </button>
                      </div>
                      <span className="block text-[9px] font-mono text-[#FF3333] font-bold text-left">* SEND EXACTLY ₱{Number(selectedAccount.price).toFixed(2)}</span>
                    </div>

                    <div className="mx-auto border border-zinc-800 p-1.5 bg-white rounded-sm">
                      {gcashSettings.gcash_qr_url ? (
                        <img
                          src={gcashSettings.gcash_qr_url}
                          alt="GCash QR Code Receiver"
                          referrerPolicy="no-referrer"
                          className="w-24 h-24 object-contain"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-gray-200 flex items-center justify-center text-black font-semibold text-[10px] font-mono">
                          NO QR CODE
                        </div>
                      )}
                    </div>
                  </div>

                  {copied && (
                    <p className="text-center text-emerald-400 text-[10px] font-mono">✓ GCash Number copied!</p>
                  )}

                  <div className="flex gap-4 pt-2">
                    <button
                      onClick={() => setModalStep("credentials")}
                      className="w-1/2 py-2.5 bg-black hover:bg-[#111] text-zinc-500 hover:text-white font-mono text-xs uppercase border border-zinc-800"
                    >
                      BACK
                    </button>
                    
                    <button
                      onClick={() => setModalStep("upload_receipt")}
                      className="w-1/2 py-2.5 bg-[#FFD700] hover:bg-white text-black font-black uppercase tracking-wider font-mono text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>I HAVE PAID</span>
                      <ArrowRight className="w-3.5 h-3.5 text-black" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: UPLOAD RECEIPT OCR */}
              {modalStep === "upload_receipt" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <span className="text-[10px] font-mono text-[#FFD700] font-bold uppercase tracking-widest block mb-2">
                      Upload screenshot of your payment receipt
                    </span>

                    {/* Drag & Drop Frame */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors ${
                        dragActive ? "border-[#FFD700] bg-[#FFD700]/5" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="file"
                        id="receipt-file-input"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      <label htmlFor="receipt-file-input" className="cursor-pointer block space-y-2">
                        <UploadCloud className="w-8 h-8 text-zinc-500 mx-auto" />
                        <p className="text-zinc-300 font-bold text-xs uppercase font-mono">
                          Drag & Drop or Choose Image file
                        </p>
                        <p className="text-[10px] text-zinc-650 text-zinc-500 font-mono">
                          PNG, JPEG, size up to 20MB
                        </p>
                      </label>
                    </div>
                  </div>

                  {/* Thumbnail Preview rendering if selected */}
                  {receiptBase64 && (
                    <div className="p-3 bg-zinc-950 border border-zinc-900 rounded flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={receiptBase64}
                          alt="Receipt Thumbnail"
                          className="w-10 h-14 object-cover border border-zinc-800 rounded"
                        />
                        <span className="text-[11px] font-mono text-zinc-400">GCash_Receipt_Screenshot.png</span>
                      </div>
                      <button
                        onClick={() => setReceiptBase64(null)}
                        className="text-[#FF3333] hover:text-white text-[10px] uppercase font-bold"
                      >
                        REMOVE
                      </button>
                    </div>
                  )}

                  {ocrError && (
                    <p className="text-xs text-[#FF3333] font-mono leading-relaxed bg-[#FF3333]/5 border border-[#FF3333]/15 p-2.5 rounded text-left">
                      ⚠ {ocrError}
                    </p>
                  )}

                  <div className="flex gap-4">
                    <button
                      onClick={() => setModalStep("pay_instructions")}
                      className="w-1/2 py-2.5 bg-black hover:bg-[#111] text-zinc-500 hover:text-white font-mono text-xs uppercase border border-zinc-800"
                    >
                      BACK
                    </button>
                    
                    <button
                      onClick={verifyGCashReceiptOCR}
                      disabled={!receiptBase64 || verifyingPayment}
                      className="w-1/2 py-2.5 bg-[#FFD700] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed hover:bg-white text-black font-black uppercase tracking-wider font-mono text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {verifyingPayment ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                          <span>AI OCR ANALYSIS...</span>
                        </>
                      ) : (
                        <>
                          <span>VERIFY RECEIPT</span>
                          <ShieldCheck className="w-3.5 h-3.5 text-black" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: AUTOPILOT CLONING LOADER */}
              {modalStep === "cloning_loader" && (
                <div className="py-8 text-center space-y-6" id="account-cloner-running">
                  <div className="h-16 w-16 bg-[#FFD700]/5 text-[#FFD700] border border-[#FFD700]/15 rounded-full flex items-center justify-center mx-auto animate-spin">
                    <RefreshCw className="w-8 h-8 text-[#FFD700]" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-base text-white tracking-widest font-mono uppercase font-bold text-center">
                      CREATING YOUR ACCOUNT...
                    </h4>
                    <span className="text-[10px] text-[#FFD700] font-mono uppercase font-bold tracking-wider block text-center animate-pulse">
                      ~10 seconds remaining
                    </span>
                    <p className="text-zinc-400 text-xs leading-relaxed max-w-sm mx-auto p-4 bg-zinc-950 border border-zinc-900 rounded font-mono text-[9px] text-zinc-500">
                      &gt; registering email targets on CarX ID endpoints... OK<br />
                      &gt; creating device uuid: {crypto.randomUUID().replace(/-/g, "").slice(0, 16)}<br />
                      &gt; downloading profile package snapshot: {selectedAccount.snapshot_url || "default"}<br />
                      &gt; compressing profile (gzip stream + base64 headers)... OK<br />
                      &gt; uploading database calibration blocks... OPERATIONAL
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 5: DELIVERED CREDENTIALS PANEL */}
              {modalStep === "delivery_panel" && (
                <div className="space-y-6" id="account-delivery-panel">
                  <div className="text-center space-y-1.5">
                    <span className="inline-flex p-3 bg-emerald-500/5 text-emerald-400 border border-emerald-500/10 rounded-full mb-2">
                      <Check className="w-6 h-6 text-emerald-400" />
                    </span>
                    <h4 className="text-xl font-black italic uppercase text-white tracking-tight">
                      CONGRATULATIONS! PACKAGE INJECTED
                    </h4>
                    <p className="text-zinc-500 text-xs leading-relaxed max-w-md mx-auto">
                      Your chosen resource package was successfully built and securely injected into your CarX account using our autopilot system. You can now log into your account to see the changes.
                    </p>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-md space-y-2.5 relative">
                    <span className="block text-[10px] font-mono text-[#FFD700] uppercase font-bold">
                      INJECTION CONFIRMATION DETAILS
                    </span>
                    
                    <div className="p-3 bg-black border border-zinc-900 rounded font-mono text-xs space-y-1 text-zinc-300 relative">
                      <p>📧 CarX Email: <span className="text-[#FFD700]">{carxEmail}</span></p>
                      <p>📦 Package: <span className="text-[#FFD700]">{selectedAccount.name}</span></p>
                    </div>

                    <p className="text-[10px] text-zinc-500 leading-normal lowercase italic mt-2">
                      * You can track this purchase on security order sequence ID: <strong>{currentOrderId}</strong>
                    </p>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button
                      onClick={() => onNavigate("order_status", currentOrderId)}
                      className="w-1/2 py-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>TRACK MY ORDER</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={handleCloseCheckoutModal}
                      className="w-1/2 py-3 bg-[#FFD700] hover:bg-white text-black font-black uppercase tracking-wider font-mono text-xs text-center cursor-pointer"
                    >
                      COMPLETE
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
