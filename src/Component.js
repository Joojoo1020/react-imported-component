import React, {Component} from 'react';
import PropTypes from 'prop-types';
import isNode from 'detect-node';
import {useMark} from './marks';
import NotSoPureComponent from "./NotSoPureComponent";
import toLoadable from "./loadable";
import {UIDConsumer} from "./context";

const STATE_LOADING = 'loading';
const STATE_ERROR = 'error';
const STATE_DONE = 'done';

const FragmentNode = ({children}) => <div>{children}</div>;
FragmentNode.propTypes = {
  children: PropTypes.any
};
const Fragment = React.Fragment ? React.Fragment : FragmentNode;

export const settings = {
  hot: !!module.hot,
  SSR: true
};

const getLoadable = importFunction => {
  if ('promise' in importFunction) {
    return importFunction;
  }
  return toLoadable(importFunction, false);
};

export class UnconnectedReactImportedComponent extends Component {

  mounted = false;

  constructor(props) {
    super(props);
    this.state = this.pickPrecached() || {};

    if (isNode && settings.SSR &&
      this.props.streamId) {
      useMark(this.props.streamId, this.props.loadable.mark);
      if (this.state.state !== STATE_DONE) {
        this.state.state = STATE_LOADING;
        this.reload();
      }
    }
  }

  componentDidMount() {
    this.mounted = true;
    useMark(this.props.streamId, this.props.loadable.mark);
    if (this.state.state !== STATE_DONE) {
      this.reload();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  pickPrecached() {
    const loadable = getLoadable(this.props.loadable);
    if (loadable.done) {
      return {
        AsyncComponent: this.props.exportPicker(loadable.payload),
        state: loadable.ok ? STATE_DONE : STATE_ERROR
      };
    }
    return null;
  }

  loadAsyncComponent() {
    const loadable = getLoadable(this.props.loadable);
    if (loadable.done) {
      this.setState(this.pickPrecached());
      return loadable.promise;
    } else {
      this.loadingPromise = loadable.load();
      return this.loadingPromise.then((payload) => {
        if (this.mounted) {
          this.setState({
            AsyncComponent: this.props.exportPicker(payload),
            state: STATE_DONE
          });
        }
      });
    }
  }

  remount() {
    this.loadAsyncComponent().catch(err => {
      /* eslint-disable */
      console.error('[React-imported-component]', err);
      /* eslint-enable */
      this.setState({
        state: STATE_ERROR,
        error: err
      });
      if (this.props.onError) {
        this.props.onError(err);
      } else {
        throw err;
      }
    });
  }

  onHRM = () => {
    if (settings.hot) {
      setImmediate(() => {
        this.props.loadable.reset();
        this.remount()
      });
    }
  };

  reload = () => {
    if (this.mounted) {
      this.setState({
        state: STATE_LOADING
      });
    }
    this.remount();
  };

  fragmentedRender(payload) {
    if (settings.hot) {
      return (
        <Fragment>
          {payload}
          <NotSoPureComponent onUpdate={this.onHRM}/>
        </Fragment>
      );
    }
    return payload;
  }

  render() {
    const {AsyncComponent, state} = this.state;
    const {LoadingComponent, ErrorComponent} = this.props;

    if (this.props.render) {
      return this.fragmentedRender(this.props.render(AsyncComponent, state, this.props))
    }

    if (AsyncComponent) {
      return this.fragmentedRender(<AsyncComponent {...this.props} />)
    }

    switch (state) {
      case STATE_LOADING:
        if (this.props.async) {
          throw this.loadingPromise;
        }
        return LoadingComponent
          ? React.Children.only(<LoadingComponent {...this.props} />)
          : null;
      case STATE_ERROR:
        return ErrorComponent
          ? React.Children.only(<ErrorComponent retryImport={this.reload} error={this.state.error} {...this.props} />)
          : null;
      default:
        return null;
    }
  }
}

const es6import = (module) => (
  module.default
    ? module.default
    : module
);

const BaseProps = {
  loadable: PropTypes.oneOfType([PropTypes.object, PropTypes.func]).isRequired,
  LoadingComponent: PropTypes.func,
  ErrorComponent: PropTypes.func,
  exportPicker: PropTypes.func,
  render: PropTypes.func,
  ssrMark: PropTypes.string,
  async: PropTypes.bool,

  onError: PropTypes.func
};

UnconnectedReactImportedComponent.propTypes = {
  ...BaseProps,
  streamId: PropTypes.number
};

UnconnectedReactImportedComponent.defaultProps = {
  exportPicker: es6import,
  async: false
};

const ReactImportedComponent = (props) => (
  settings.SSR
    ? <UIDConsumer>{UID => <UnconnectedReactImportedComponent {...props} streamId={UID | 0}/>}</UIDConsumer>
    : <UnconnectedReactImportedComponent {...props} streamId={0}/>
);

ReactImportedComponent.propTypes = BaseProps;

export default ReactImportedComponent;