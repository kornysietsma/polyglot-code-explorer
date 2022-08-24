import "./Messages.css";

import { Action, Message } from "./state";

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
    <div className="Messages">
      <h3>Messages:</h3>
      <ul>
        {messages.map((message, ix) => (
          <li key={ix} className={message.severity}>
            {message.message}
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
