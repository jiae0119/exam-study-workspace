import { AnimatePresence, motion } from "framer-motion";

const PIECES = 32;

const colors = [
  "#5b8cff",
  "#3ddc97",
  "#ffc14d",
  "#ff6b6b",
  "#c7a6ff",
  "#8fe6ff",
];

function ConfettiParticles() {
  return (
    <div
      className="confetti"
      aria-hidden
    >
      {Array.from({ length: PIECES }, (_, i) => {
        const a = (i / PIECES) * Math.PI * 2 + Math.random() * 0.2;
        const d = 130 + Math.random() * 140;
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d - 50 * Math.random();
        return (
          <motion.span
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "32%",
              width: 4 + (i % 4) * 2,
              height: 8 + (i % 3) * 3,
              background: colors[i % colors.length],
              borderRadius: 2,
              willChange: "transform, opacity",
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x, y, opacity: 0, rotate: 240 + (i % 3) * 20 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

export function Celebration({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ConfettiParticles />
          <motion.div
            className="celebration__toast-wrap"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            style={{ position: "fixed", zIndex: 30, pointerEvents: "none" }}
          >
            <div className="celebration__toast" role="status" aria-live="polite">정답! 잘했어요</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
