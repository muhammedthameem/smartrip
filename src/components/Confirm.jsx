import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { Button, Modal } from "./ui";

const ConfirmContext = createContext(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const current = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      const next = { ...options, resolve };
      current.current = next;
      setRequest(next);
    });
  }, []);

  const close = useCallback((value) => {
    const pending = current.current;
    current.current = null;
    setRequest(null);
    pending?.resolve(value);
  }, []);

  const tone = request?.tone || "default";
  const Icon =
    request?.icon ||
    (tone === "danger"
      ? Trash2
      : tone === "warning"
        ? AlertTriangle
        : CheckCircle2);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Modal
          title={request.title || "Please confirm"}
          onClose={() => close(false)}
        >
          <div className={"confirm-dialog tone-" + tone}>
            <div className="confirm-body">
              <span className="confirm-icon">
                <Icon size={21} />
              </span>
              <div className="confirm-copy">
                <p>{request.message}</p>
                {request.detail && <small>{request.detail}</small>}
              </div>
            </div>
            <div className="confirm-actions">
              <Button variant="secondary" onClick={() => close(false)}>
                {request.cancelLabel || "Cancel"}
              </Button>
              <Button
                variant={tone === "danger" ? "danger" : ""}
                onClick={() => close(true)}
              >
                {request.confirmLabel || "Confirm"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
