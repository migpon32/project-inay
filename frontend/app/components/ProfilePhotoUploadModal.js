"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const FRAME_SIZE = 224;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function baseScaleFor(dimensions) {
  if (!dimensions.width || !dimensions.height) return 1;

  return Math.max(FRAME_SIZE / dimensions.width, FRAME_SIZE / dimensions.height);
}

function clampPosition(position, zoom, dimensions) {
  if (!dimensions.width || !dimensions.height) return { x: 0, y: 0 };

  const scale = baseScaleFor(dimensions) * zoom;
  const maxX = Math.max(0, ((dimensions.width * scale) - FRAME_SIZE) / 2);
  const maxY = Math.max(0, ((dimensions.height * scale) - FRAME_SIZE) / 2);

  return {
    x: clamp(position.x, -maxX, maxX),
    y: clamp(position.y, -maxY, maxY),
  };
}

function fileValidationMessage(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension) || (file.type && !ALLOWED_TYPES.has(file.type))) {
    return "Please choose a JPG, JPEG, or PNG image.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "The image must be 4 MB or smaller.";
  }

  return null;
}

function createCroppedPhoto(image, dimensions, zoom, position) {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  const outputRatio = OUTPUT_SIZE / FRAME_SIZE;
  const scale = baseScaleFor(dimensions) * zoom * outputRatio;
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  const x = (OUTPUT_SIZE / 2) + (position.x * outputRatio) - (width / 2);
  const y = (OUTPUT_SIZE / 2) + (position.y * outputRatio) - (height / 2);

  context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.save();
  context.beginPath();
  context.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to prepare this image. Please choose another photo."));
        return;
      }

      resolve(new File([blob], "profile-photo.png", { type: "image/png" }));
    }, "image/png");
  });
}

export function ProfilePhotoToast({ notice, onClose }) {
  if (!notice) return null;

  const isSuccess = notice.type === "success";

  return (
    <div
      className={`fixed right-4 top-24 z-[120] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-xl sm:max-w-sm ${
        isSuccess ? "border-emerald-200" : "border-rose-200"
      }`}
      role={isSuccess ? "status" : "alert"}
      aria-live="polite"
    >
      {isSuccess ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      ) : (
        <X className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
      )}
      <p className={`min-w-0 flex-1 text-sm font-bold leading-5 ${isSuccess ? "text-emerald-800" : "text-rose-800"}`}>
        {notice.text}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-300"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ProfilePhotoUploadModal({
  title,
  subjectName,
  accent = "pink",
  onClose,
  onSave,
  onUploadError,
}) {
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const imageRef = useRef(null);
  const objectUrlRef = useRef(null);
  const dragRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const accentClasses = accent === "violet"
    ? {
        button: "bg-violet-600 hover:bg-violet-700 focus:ring-violet-300 disabled:bg-violet-300",
        border: "border-violet-300 bg-violet-50/60",
        icon: "text-violet-600",
        ring: "ring-violet-500",
      }
    : {
        button: "bg-pink-600 hover:bg-pink-700 focus:ring-pink-300 disabled:bg-pink-300",
        border: "border-pink-300 bg-pink-50/60",
        icon: "text-pink-600",
        ring: "ring-pink-500",
      };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const beginClose = () => {
    if (isClosing) return;

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 170);
  };

  const requestClose = () => {
    if (!isUploading) beginClose();
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const resetEditor = () => {
    setZoom(MIN_ZOOM);
    setPosition({ x: 0, y: 0 });
  };

  const loadFile = (nextFile) => {
    setError("");

    const validationMessage = fileValidationMessage(nextFile);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

    const objectUrl = URL.createObjectURL(nextFile);
    const image = new Image();
    objectUrlRef.current = objectUrl;

    image.onload = () => {
      imageRef.current = image;
      setFile(nextFile);
      setPreviewUrl(objectUrl);
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      resetEditor();
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      objectUrlRef.current = null;
      setError("This image could not be opened. Please choose another file.");
    };

    image.src = objectUrl;
  };

  const handleFileInput = (event) => {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (nextFile) loadFile(nextFile);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) loadFile(nextFile);
  };

  const updateZoom = (nextZoom) => {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(clampedZoom);
    setPosition((current) => clampPosition(current, clampedZoom, dimensions));
  };

  const handlePointerDown = (event) => {
    if (!file || isUploading) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      position,
    };
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;

    setPosition(clampPosition({
      x: dragRef.current.position.x + event.clientX - dragRef.current.x,
      y: dragRef.current.position.y + event.clientY - dragRef.current.y,
    }, zoom, dimensions));
  };

  const handlePointerEnd = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const handlePreviewKeyDown = (event) => {
    if (!file || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

    event.preventDefault();
    const distance = event.shiftKey ? 10 : 3;
    const movement = {
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
    }[event.key];

    setPosition((current) => clampPosition({
      x: current.x + movement.x,
      y: current.y + movement.y,
    }, zoom, dimensions));
  };

  const savePhoto = async () => {
    if (!file || !imageRef.current) {
      setError("Choose an image before saving.");
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      const croppedFile = await createCroppedPhoto(imageRef.current, dimensions, zoom, position);
      await onSave(croppedFile);
      beginClose();
    } catch (uploadError) {
      const message = uploadError.response?.data?.message
        || uploadError.message
        || "Unable to upload the profile photo.";
      setError(message);
      onUploadError?.(message);
    } finally {
      setIsUploading(false);
    }
  };

  const imageScale = baseScaleFor(dimensions) * zoom;

  return (
    <div
      className={`${isClosing ? "profile-photo-overlay-out" : "profile-photo-overlay"} fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 px-4 py-5 backdrop-blur-[2px]`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-photo-title"
        aria-describedby="profile-photo-description"
        onKeyDown={handleDialogKeyDown}
        className={`${isClosing ? "profile-photo-dialog-out" : "profile-photo-dialog"} max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl`}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="profile-photo-title" className="text-lg font-extrabold text-slate-950 sm:text-xl">{title}</h2>
            <p id="profile-photo-description" className="mt-1 text-sm font-semibold text-slate-500">
              Choose a clear photo, then drag and zoom to position it.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isUploading}
            autoFocus
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50"
            aria-label="Close photo upload"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          {file ? (
            <>
              <div className="flex flex-col items-center">
                <div
                  role="application"
                  tabIndex={0}
                  aria-label={`Crop preview for ${subjectName}. Drag the image or use arrow keys to reposition it.`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  onKeyDown={handlePreviewKeyDown}
                  className={`relative h-56 w-56 touch-none overflow-hidden rounded-full bg-slate-100 shadow-inner ring-4 ${accentClasses.ring} ring-offset-4 ring-offset-white focus:outline-none focus:ring-[6px]`}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${previewUrl})`,
                      width: dimensions.width * imageScale,
                      height: dimensions.height * imageScale,
                      left: `calc(50% + ${position.x}px)`,
                      top: `calc(50% + ${position.y}px)`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/70" />
                </div>
                <p className="mt-4 text-center text-xs font-bold text-slate-500">
                  Drag the photo to reposition it inside the circle.
                </p>
              </div>

              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <button
                  type="button"
                  onClick={() => updateZoom(zoom - ZOOM_STEP)}
                  disabled={zoom <= MIN_ZOOM || isUploading}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-40"
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <label className="min-w-0">
                  <span className="sr-only">Photo zoom</span>
                  <input
                    type="range"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step="0.05"
                    value={zoom}
                    disabled={isUploading}
                    onChange={(event) => updateZoom(Number(event.target.value))}
                    className="w-full accent-pink-600"
                    aria-label="Photo zoom level"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => updateZoom(zoom + ZOOM_STEP)}
                  disabled={zoom >= MAX_ZOOM || isUploading}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-40"
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => updateZoom(zoom - ZOOM_STEP)}
                  disabled={zoom <= MIN_ZOOM || isUploading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-40"
                >
                  <ZoomOut className="h-4 w-4" /> Zoom Out
                </button>
                <button
                  type="button"
                  onClick={resetEditor}
                  disabled={isUploading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" /> Reset Position
                </button>
                <button
                  type="button"
                  onClick={() => updateZoom(zoom + ZOOM_STEP)}
                  disabled={zoom >= MAX_ZOOM || isUploading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-40"
                >
                  <ZoomIn className="h-4 w-4" /> Zoom In
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-center py-2">
              <div className={`flex h-32 w-32 items-center justify-center rounded-full border-2 border-dashed ${accentClasses.border}`}>
                <ImagePlus className={`h-10 w-10 ${accentClasses.icon}`} />
              </div>
            </div>
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingOver(false);
            }}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-pink-300 ${
              isDraggingOver ? accentClasses.border : "border-slate-300 bg-slate-50 hover:border-pink-300 hover:bg-pink-50/40"
            }`}
            aria-label={file ? "Choose another profile photo or drop one here" : "Choose a profile photo or drop one here"}
          >
            <Upload className={`h-5 w-5 ${accentClasses.icon}`} />
            <p className="mt-2 text-sm font-extrabold text-slate-800">
              {file ? "Choose another photo" : "Drop an image here or choose a file"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">JPG, JPEG, or PNG, up to 4 MB</p>
            {file && <p className="mt-2 max-w-full truncate text-xs font-bold text-slate-600">{file.name}</p>}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={handleFileInput}
            className="sr-only"
            aria-label="Select profile photo"
          />

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">
              {error}
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={requestClose}
            disabled={isUploading}
            className="h-11 rounded-lg border border-slate-200 px-5 text-sm font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={savePhoto}
            disabled={!file || isUploading}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-extrabold text-white focus:outline-none focus:ring-2 disabled:cursor-not-allowed ${accentClasses.button}`}
          >
            {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isUploading ? "Uploading..." : "Save Photo"}
          </button>
        </footer>
      </section>
    </div>
  );
}
