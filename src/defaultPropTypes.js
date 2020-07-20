import PropTypes from "prop-types";

const defaultPropTypes = {
  dataRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  state: PropTypes.shape({
    config: PropTypes.any.isRequired,
    couplingConfig: PropTypes.any.isRequired,
    expensiveConfig: PropTypes.any.isRequired,
    constants: PropTypes.any.isRequired
  }).isRequired,
  dispatch: PropTypes.func.isRequired
};

export default defaultPropTypes;
