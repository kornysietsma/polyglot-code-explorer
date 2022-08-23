import styles from "./Messages.module.css";
import { Action, Message } from "./state";

function severityClass(severity: "info" | "warn" | "error"): string {
  switch (severity) {
    case "info":
      return styles.info;
    case "warn":
      return styles.warn;
    case "error":
      return styles.error;
  }
}

const Messages = ({
  messages,
  dispatch,
}: {
  messages: Message[];
  dispatch: React.Dispatch<Action>;
}) => {
  if (messages.length == 0) {
    return <></>;
  }
  return (
    <div className="messages">
      <h3>Messages:</h3>
      <ul className={`${styles.list}`}>
        {messages.map((message, ix) => (
          <li key={ix} className={severityClass(message.severity)}>
            {message.lines.join("<br/>")}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: "clearMessages",
          })
        }
      >
        clear messages
      </button>
    </div>
  );
};

export default Messages;
