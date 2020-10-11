import PropTypes from "prop-types";

const defaultPropTypes = {
  /* eslint-disable react/forbid-prop-types */
  dataRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  state: PropTypes.shape({
    config: PropTypes.any.isRequired,
    couplingConfig: PropTypes.any.isRequired,
    expensiveConfig: PropTypes.any.isRequired,
    calculated: PropTypes.any.isRequired,
  }).isRequired,
  dispatch: PropTypes.func.isRequired,
};

export default defaultPropTypes;
