import React from 'react'
import glamorous from 'glamorous'
class MyThing extends React.PureComponent {}
const comps = {
  MyComp: glamorous(MyThing, { rootEl: 'div' })()
}
