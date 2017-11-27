import glamorous from 'glamorous'
import React from 'react'
class MyThing extends React.PureComponent {}
const comps: { Div?: any } = {}
comps.Div = glamorous(MyThing, {rootEl: 'div'})()
