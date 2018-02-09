import * as ts from 'typescript'

export interface Options {
  getDisplayName(filename: string, bindingName: string | undefined): string | undefined
  configAttribute: ConfigAttribute
}

export type ConfigAttribute = (attributeName: string, attributeValue: string) => {
    attributeName: string
    attributeValue: string
}

function defaultGetDisplayName(_filename: string, bindingName: string | undefined): string | undefined {
  return bindingName
}

function defaultConfigAttribute(attributeName: string, attributeValue: string) {
  return {
    attributeName,
    attributeValue
  }
}

// import g from 'glamorous' -> glamorous
function getImportedLibName(node: ts.Node): string | void {
  return (node as ts.ImportDeclaration).moduleSpecifier.getText().replace(/"/g, '\'')
}

// import g from 'glamorous' -> g
function getAliasGlamorousName(node: ts.Node): string | void {
  if (getImportedLibName(node) === '\'glamorous\'') {
    const importNode = (node as ts.ImportDeclaration).importClause!
    if (importNode.name) {
      return (node as ts.ImportDeclaration).importClause!.name!.escapedText as string
    }
  }
}

// const MyButton = g.button() -> MyButton
function getGlamorousDisplayName(node: ts.Node, aliasGlamorousLibName: string): string {
  const callExp = node as ts.CallExpression
  const propertyAccessExp = callExp.expression as ts.PropertyAccessExpression
  const varName = propertyAccessExp.expression as ts.Identifier
  const displayName = node.parent!.getChildAt(0).getText()
  return varName.escapedText === aliasGlamorousLibName ? displayName : ''
}

// idName.propertyName.withConfig({
//   displayName: displayName
// })()
function createWithConfNodeByParams(idName: string, propertyName: string, displayName: string): ts.Node {
  return ts.createCall(
    ts.createPropertyAccess(
      ts.createPropertyAccess(
        ts.createIdentifier(idName),
        propertyName
      ),
      'withConfig'
    ),
    undefined,
    [ts.createObjectLiteral([ts.createPropertyAssignment('displayName', ts.createLiteral(displayName))])]
  )
}

function createWithConfNodeByNode(node: ts.Node, getDisplayName: typeof defaultGetDisplayName, aliasGlamorousLibName: string): ts.Node {
  const displayName = getDisplayName(node.getSourceFile().fileName, getGlamorousDisplayName(node.parent!, aliasGlamorousLibName))
  const propertyName = (node as ts.PropertyAccessExpression).name.getText()
  const idName = node.getChildAt(0).getText()
  if (idName !== aliasGlamorousLibName) {
    return node
  }
  return createWithConfNodeByParams(idName, propertyName!, displayName!)
}

// idName(MyThing, {rootEl: 'div'}).withConfig({
//   displayName: displayName
// })()
function createWithConfNodeByNode2(node: ts.Node, getDisplayName: typeof defaultGetDisplayName, aliasGlamorousLibName: string): ts.Node {
  const displayName = getDisplayName(node.getSourceFile().fileName, getGlamorousDisplayName(node.parent!, aliasGlamorousLibName))
  const idName = node.getChildAt(0).getText()
  if (idName !== aliasGlamorousLibName) {
    return node
  }
  return ts.createCall(
    ts.createPropertyAccess(
      node as ts.Expression,
      'withConfig'
    ),
    undefined,
    [ts.createObjectLiteral([ts.createPropertyAssignment('displayName', ts.createLiteral(displayName!))])]
  )
}

function isPropAccess(node: ts.Node): boolean {
  return node.kind === ts.SyntaxKind.PropertyAccessExpression
}

function isCallExp(node: ts.Node): boolean {
  return node.kind === ts.SyntaxKind.CallExpression
}

// parent is CallExpression
// parent.parent is VariableDeclaration
function isChildOfCallExpInVarDecl(node: ts.Node): boolean {
  if (node.parent
    && node.parent.parent
    && node.parent.kind === ts.SyntaxKind.CallExpression
    // const comp = {}
    // comp.div = g(MyThing, {rootEl: 'div'})()
    && (
        node.parent.parent.kind === ts.SyntaxKind.VariableDeclaration
      || node.parent.parent.kind === ts.SyntaxKind.BinaryExpression
    )
  ) {
    return true
  }
  return false
}

function isChildOfCallExpInPropAssign(node: ts.Node): boolean {
  if (node.parent
    && node.parent.parent
    && node.parent.kind === ts.SyntaxKind.CallExpression
    && node.parent.parent.kind === ts.SyntaxKind.PropertyAssignment
  ) {
    return true
  }
  return false
}

function createWithDefaultPropsNode(displayName: string, configAttribute: ConfigAttribute) {
  const { attributeName, attributeValue } = configAttribute('data-glamorous', displayName)
  return ts.createVariableDeclaration(attributeValue + '.defaultProps', void 0,
    ts.createObjectLiteral([
      ts.createPropertyAssignment(
        ts.createLiteral(attributeName),
        ts.createLiteral(displayName)
      )
    ]))
}

function addDefaultProps(node: ts.Node, aliasGlamorousLibName: string, configAttribute: ConfigAttribute) {
    if (node.kind === ts.SyntaxKind.VariableStatement && node.getChildAt(0).getText() === 'export') {
        const varDecl = node.getChildAt(1).getChildAt(1)
        const displayName = (varDecl.getChildAt(0) as any).name.escapedText
        const varDeclRight = (varDecl.getChildAt(0) as any).initializer
        let idName = void 0
        try {
            idName = varDeclRight.expression.expression.escapedText
        } catch {
            return null
        }
        if (idName === aliasGlamorousLibName) {
            const newNode = createWithDefaultPropsNode(displayName, configAttribute)
            return [node, newNode]
        }
    }
    return null
}

export function createTransformer(options?: Partial<Options>): ts.TransformerFactory<ts.SourceFile>
    export function createTransformer({ getDisplayName = defaultGetDisplayName, configAttribute = defaultConfigAttribute }: Partial<Options> = {}) {
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    let aliasGlamorousLibName: string | void
    const visitor: ts.Visitor = (node) => {

      ts.forEachChild(node, n => {
        if (!n.parent) {
          n.parent = node
        }
      })

      if (node.kind === ts.SyntaxKind.SourceFile) {
        return ts.visitEachChild(node, visitor, context)
      }

      if (node.kind === ts.SyntaxKind.ImportDeclaration && !aliasGlamorousLibName) {
        aliasGlamorousLibName = getAliasGlamorousName(node)
      }

      if (!aliasGlamorousLibName) {
        return node
      }

      const t = addDefaultProps(node, aliasGlamorousLibName, configAttribute)
      if (t) {
          return t
      }

      // const MyButton = g.button()
      // node: g.button()
      if (isPropAccess(node) && isChildOfCallExpInVarDecl(node)) {
        return createWithConfNodeByNode(node, getDisplayName, aliasGlamorousLibName)
      }

      // const MyComp = g(MyThing, {rootEl: 'div'})()
      // node: g(MyThing, {rootEl: 'div'})
      if (isCallExp(node) && isChildOfCallExpInVarDecl(node)) {
       return createWithConfNodeByNode2(node, getDisplayName, aliasGlamorousLibName)
      }

      // { x: g.button() }
      // node: g.button()
      if (isPropAccess(node) && isChildOfCallExpInPropAssign(node)) {
        return createWithConfNodeByNode(node, getDisplayName, aliasGlamorousLibName)
      }

      // { x: g(MyThing, {rootEl: 'div'})() }
      // node: g(MyThing, {rootEl: 'div'})
      if (isCallExp(node) && isChildOfCallExpInPropAssign(node)) {
        return createWithConfNodeByNode2(node, getDisplayName, aliasGlamorousLibName)
      }

      return ts.visitEachChild(node, visitor, context)
    }
    return (node) => ts.visitNode(node, visitor)
  }
  return transformer
}

export default createTransformer
