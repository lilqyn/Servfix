import { useState, useRef, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Smile, Image } from "lucide-react";

interface MessageInputProps {
  onSend: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MessageInput = ({
  onSend,
  placeholder = "Type a message...",
  disabled = false,
}: MessageInputProps) => {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="p-4 border-t border-border bg-background">
      <div className="flex items-end gap-2">
        <div className="hidden sm:flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={disabled}>
            <Paperclip className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={disabled}>
            <Image className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="min-h-[44px] max-h-[120px] resize-none pr-10 py-3"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 bottom-1 h-8 w-8"
            disabled={disabled}
          >
            <Smile className="h-5 w-5" />
          </Button>
        </div>

        <Button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          size="icon"
          className="h-11 w-11 rounded-full shrink-0"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-2 text-center sm:hidden">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
};

export default MessageInput;
