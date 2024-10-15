// placeholder for enumerating RN elements

// Attempt to get the tag name of a React element
export const getTagName = (value: any) : string | null => {
  if (value.type && value.type !== undefined) {
    if (typeof value?.type === 'string') return value.type;
    if (value.type && value.type.name) return value.type.name;
    if (typeof value?.elementType === 'string') return value.elementType;
    if (value.elementType && value.elementType.name) return value.elementType.name;
    if (value.elementType && value.elementType.displayName) return value.elementType.displayName;
    if (value.type.$$typeof && typeof value.type.$$typeof === 'object') return value.type.$$typeof?.displayName;
  } else {
    return null;
  }

  if (value && value.return) {
    if (getTagName(value.return) === 'AppContainer') {
      console.log('[*][getTagName] Found AppContainer parent');
    }
  }

  return 'unknown';
};

export const inspectElements = (value: any) => {
  let name: string = '';
  if (value && value !== undefined && value !== null) {
    
    if (value.type) name = getTagName(value) || '';

    if (name === 'RCTView') {
      let child = value.return;
      let childName = getTagName(child.return);
      // console.log('childName', childName);
      if (childName === 'View') {

        // console.log('[*] Found a view! There should be good stuff here!');

        let view = child.return;
        // console.log('view', view.return);
        // console.log('view', view.return?.stateNode);
        // console.log('view.return Props:', JSON.stringify(Object.keys(view.return.stateNode.props)));
      }
    }
  }
};

export const findView = (value: any) : Object | null =>  {
  let name: string = '';
  if (value && value !== undefined && value !== null) {
    
    if (value.type) name = getTagName(value) || '';

    if (name === 'RCTView') {
      console.log(value)
      let child = value.return;
      let childName = getTagName(child.return);
      // console.log('childName', childName);
      if (childName === 'View') {

        // console.log('[*] Found a view! There should be good stuff here!');

        // let view = child.return;
        // console.log('view', view.return);
        return child.return;
        // console.log('view', view.return?.stateNode);
        // console.log('view.return Props:', JSON.stringify(Object.keys(view.return.stateNode.props)));
      }
    }
  }
  return null;
};

