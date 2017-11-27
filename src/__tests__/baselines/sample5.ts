import React from 'react'
import g from 'glamorous'
class MyThing extends React.PureComponent {}
const MyComp = g(MyThing, {rootEl: 'div'})()
