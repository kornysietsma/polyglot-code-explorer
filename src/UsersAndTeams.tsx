import React from "react";
import ReactModal from "react-modal";

const UsersAndTeams = () => {
  const [modalIsOpen, setIsOpen] = React.useState(false);

  function openModal() {
    setIsOpen(true);
  }

  function cancel() {
    setIsOpen(false);
  }
  function save() {
    setIsOpen(false);
  }
  return (
    <div>
      <button onClick={openModal} type="button">
        Users and Teams
      </button>
      <ReactModal
        isOpen={modalIsOpen}
        onRequestClose={cancel}
        contentLabel="Users and Teams"
        className={"ModalContent"}
        overlayClassName={"ModalOverlay"}
      >
        <div>
          <button onClick={save}>save and close</button>
          <button onClick={cancel}>cancel</button>
        </div>
        <h3>Users and Teams</h3>
        <p>To be completed</p>
      </ReactModal>
    </div>
  );
};

export default UsersAndTeams;
