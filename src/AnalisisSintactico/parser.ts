import { InfoToken } from "../AnalisisLexico/InfoToken";
import { Asociatividad } from "./Asociatividad";
import { Lexer } from "../AnalisisLexico/Lexer";
import { ErrorLexerP, ErrorParser, ExitoParser, ResParser } from "./ResParser";
import { ExprRes, PEOF, PError, PErrorLexer, PExito, PReturn } from "./ExprRes";
import { ErrorComun, Expect } from "./Expect";
import {
    EBloque,
    EBool,
    EDeclaracion,
    EIdentificador,
    ENumero,
    eOperador,
    EOperadorApl,
    ETexto,
    Expresion
} from "./Expresion";
import { SignIndefinida } from "./Signatura";
import { ExprIdInfo } from "./ExprIdInfo";
import { ResLexer } from "../AnalisisLexico/ResLexer";
import { obtPosExpr } from "./PosExpr";

function obtInfoFunAppl(esCurry: boolean, inicio: number, numLinea: number, posInicioLinea: number): InfoToken<string> {
    return {
        valor: (esCurry) ? "Ñ" : "ñ",
        inicio,
        final: inicio + 1,
        numLinea,
        posInicioLinea
    }
}

function obtInfoOp(operador: string): [number, Asociatividad] {
    switch (operador) {
        case ",":
            return [1, Asociatividad.Izq]
        case "=":
        case "+=":
        case "-=":
        case "*=":
        case "/=":
        case "%=":
        case "^=":
            return [2, Asociatividad.Izq]
        case "<|":
        case "|>":
            return [3, Asociatividad.Izq]
        case "<<" :
        case ">>":
            return [4, Asociatividad.Izq]
        case "||":
            return [5, Asociatividad.Izq]
        case "&&":
            return [6, Asociatividad.Izq]
        case "??":
            return [7, Asociatividad.Izq]
        case "==":
        case "!=":
        case "===":
        case "!==":
            return [8, Asociatividad.Izq]
        case "<" :
        case "<=":
        case ">=":
        case ">":
            return [9, Asociatividad.Izq]
        case "+" :
        case "-":
            return [10, Asociatividad.Izq]
        case "*" :
        case "/":
        case "%":
            return [11, Asociatividad.Izq]
        case "^":
            return [12, Asociatividad.Der]
        case ".":
        case "?.":
            return [15, Asociatividad.Izq]
        case "ñ":
        case "Ñ":
            return [14, Asociatividad.Izq]
        default:
            return [13, Asociatividad.Izq]
    }
}

const crearString = (largo: number, c: string): string => {
    let cr = "";
    for (let i = 0; i < largo; i++) cr.concat(c);
    return cr;
};

export function parseTokens(lexer: Lexer): ResParser {

    let parensAbiertos = 0;

    const generarTextoError = <A>(info: InfoToken<A>): string => {
        let largo = info.final - info.posInicioLinea;
        let substr = lexer.entrada.substring(info.posInicioLinea, info.posInicioLinea + largo);
        let espBlanco = crearString(info.inicio - info.posInicioLinea, ' ');
        let indicador = crearString(info.final - info.inicio, '~');
        let numLinea = info.numLinea;
        let strIndicadorNumLinea = ` ${numLinea} | `;
        let espacioBlancoIndicador = crearString(strIndicadorNumLinea.length, ' ');
        let strIndicador = `${espBlanco}${indicador}`;
        return `${strIndicadorNumLinea}${substr}\n${espacioBlancoIndicador}${strIndicador}\n`;
    };

    function sigExprDeclaracion(nivel: number, esMut: boolean): ExprRes {
        try {

            const infoTokenId = Expect.TIdentificador(
                lexer.sigToken,
                undefined,
                "Se esperaba un identificador"
            );
            Expect.TOperador(
                lexer.sigToken,
                "=",
                "Se esperaba el operador de asignación '=' luego del indentificador."
            );

            const [_, nuevoNivel, hayNuevaLinea, fnEstablecer] = lexer.lookAheadSignificativo(false);

            if (hayNuevaLinea && nuevoNivel <= nivel) {
                throw new ErrorComun(`La expresión actual está incompleta. Se esperaba una expresión indentada.`);
            }

            if (hayNuevaLinea) {
                fnEstablecer();
            }

            const sigExpr = sigExpresion(nuevoNivel, nivel, true, 0, Asociatividad.Izq, true);
            switch (sigExpr.type) {
                case "PEOF":
                case "PReturn": {
                    return new PError("Se esperaba una expresión luego de la asignación");
                }
                case "PErrorLexer":
                    return sigExpr;
                case "PError": {
                    return new PError(`Se esperaba una expresión luego de la asignación: ${sigExpr.err}`);
                }
                case "PExito": {
                    const exprFinal = sigExpr.expr;

                    const exprDeclaracion = new EDeclaracion(
                        esMut,
                        new EIdentificador(new SignIndefinida(), infoTokenId),
                        exprFinal,
                        infoTokenId.inicio,
                        infoTokenId.numLinea,
                        infoTokenId.posInicioLinea
                    );
                    const exprRespuesta = new PExito(exprDeclaracion);
                    const sigExpresionRaw = sigExpresion(
                        nivel, nivel, true,
                        0, Asociatividad.Izq, true
                    );

                    switch (sigExpresionRaw.type) {
                        case "PError":
                            return sigExpresionRaw
                        case "PErrorLexer":
                            return sigExpresionRaw
                        case "PReturn":
                        case "PEOF":
                            return exprRespuesta
                        case "PExito": {
                            const nuevaExpr = sigExpresionRaw.expr;
                            switch (nuevaExpr.type) {
                                case "EBloque": {
                                    return new PExito(new EBloque([exprDeclaracion, ...nuevaExpr.bloque]));
                                }
                                default: {
                                    return new PExito(new EBloque([exprDeclaracion, nuevaExpr]));
                                }
                            }
                        }
                        default: {
                            let _: never;
                            _ = sigExpresionRaw;
                            return _;
                        }
                    }
                }
            }

        } catch (e) {
            if (e instanceof ErrorComun) {
                return new PError(e.message);
            } else {
                throw e;
            }
        }
    }

    function sigExprOperador(
        exprIzq: Expresion,
        infoOp: InfoToken<string>,
        nivel: number,
        _: any,
        __: any,
        esExprPrincipal: boolean
    ): ExprRes {

        const valorOp = infoOp.valor;
        const [precOp1, asocOp1] = obtInfoOp(valorOp);
        const sigExpr = sigExpresion(nivel, nivel, false, precOp1, asocOp1, false);

        switch (sigExpr.type) {
            case "PEOF":
            case "PReturn":
                return new PError(`Se esperaba una expresión a la derecha del operador ${valorOp}`);
            case "PErrorLexer":
                return sigExpr;
            case "PError":
                return new PError(`Se esperaba una expresion a la derecha del operador ${valorOp} :\n${sigExpr.err}.`);
            case "PExito": {
                const exprFinal = sigExpr.expr;

                const eOperadorRes = new eOperador(
                    new SignIndefinida(),
                    infoOp,
                    precOp1,
                    asocOp1
                );
                const exprOpRes = new EOperadorApl(eOperadorRes, exprIzq, exprFinal);

                function funDesicion(lexerRes: ResLexer, aceptarSoloOp: boolean, fnEnOp: () => void, funValorDefecto: () => ExprRes): ExprRes {
                    switch (lexerRes.type) {
                        case "EOFLexer":
                            return new PExito(exprOpRes)
                        case "ErrorLexer":
                            return new PError(lexerRes.razon)
                        case "TokenLexer": {
                            const token = lexerRes.token;
                            switch (token.type) {
                                case "TOperador": {
                                    fnEnOp();
                                    let [precOp, asocOp] = obtInfoOp(token.token.valor);
                                    return sigExprOperador(exprOpRes, token.token, nivel, precOp, asocOp, esExprPrincipal);
                                }
                                case "TParenCer": {
                                    if (!aceptarSoloOp) {
                                        lexer.retroceder();
                                        return new PExito(exprOpRes);
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                case "TIdentificador":
                                case "TNumero":
                                case "TTexto":
                                case "TBool":
                                case "TParenAb": {
                                    if (!aceptarSoloOp) {
                                        let posEI = obtPosExpr(exprIzq);
                                        let infoOp2 = obtInfoFunAppl(false, posEI.inicioPE, posEI.numLineaPE, posEI.posInicioLineaPE);

                                        let [precOpFunApl, asocOpFunApl] = obtInfoOp(infoOp2.valor);
                                        lexer.retroceder();
                                        return sigExprOperador(exprOpRes, infoOp2, nivel, precOpFunApl, asocOpFunApl, esExprPrincipal);
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                case "TGenerico": {
                                    if (!aceptarSoloOp) {
                                        const infoGen = token.token;
                                        let textoError = generarTextoError(infoGen);
                                        return new PError(`No se esperaba un genérico luego de la aplicación del operador.\n\n${textoError}`);
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                case "TComentario": {
                                    return funDesicion(lexer.sigToken(), aceptarSoloOp, fnEnOp, funValorDefecto);
                                }
                                case "PC_LET": {
                                    if (!aceptarSoloOp) {
                                        const info = token.token;
                                        let textoError = generarTextoError(info);
                                        return new PError(`No se esperaba la palabra clave 'let' luego de la aplicación del operador.\n\n${textoError}`)
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                case "PC_CONST": {
                                    if (!aceptarSoloOp) {
                                        const info = token.token;
                                        let textoError = generarTextoError(info);
                                        return new PError(`No se esperaba la palabra clave 'const' luego de la aplicación del operador.\n\n${textoError}`)
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                case "TAgrupAb": {
                                    if (!aceptarSoloOp) {
                                        const info = token.token;
                                        let textoError = generarTextoError(info);
                                        return new PError(`Este signo de agrupación aun no está soportado.\n\n${textoError}`);
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                case "TAgrupCer": {
                                    if (!aceptarSoloOp) {
                                        const info = token.token;
                                        let textoError = generarTextoError(info);
                                        return new PError(`Este signo de agrupación aun no está soportado.\n\n${textoError}`);
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                case "TNuevaLinea": {
                                    if (!aceptarSoloOp) {
                                        lexer.retroceder();
                                        let [resLexer, indentacion, _, fnEstablecer] = lexer.lookAheadSignificativo(true);

                                        let expresionRespuesta = new PExito(exprOpRes);

                                        if (esExprPrincipal) {

                                            if (indentacion < nivel) {
                                                return expresionRespuesta;
                                            } else if (indentacion == nivel) {
                                                let nuevaFnEst = () => {
                                                    fnEstablecer();
                                                    lexer.sigToken();
                                                };

                                                const funSiNoEsOp = () => {
                                                    let primeraExpresion = expresionRespuesta;
                                                    fnEstablecer();
                                                    let sigExpresionRaw = sigExpresion(nivel, nivel, false, 0, Asociatividad.Izq, true);
                                                    switch (sigExpresionRaw.type) {
                                                        case "PError":
                                                            return sigExpresionRaw;
                                                        case "PErrorLexer":
                                                            return sigExpresionRaw
                                                        case "PReturn":
                                                        case "PEOF": {
                                                            return primeraExpresion
                                                        }
                                                        case "PExito": {
                                                            const nuevaExpr = sigExpresionRaw.expr;
                                                            switch (nuevaExpr.type) {
                                                                case "EBloque": {
                                                                    const exprs = nuevaExpr.bloque;
                                                                    return new PExito(new EBloque([exprOpRes, ...exprs]));
                                                                }
                                                                default: {
                                                                    return new PExito(new EBloque([exprOpRes, nuevaExpr]));
                                                                }
                                                            }
                                                        }
                                                    }
                                                };
                                                return funDesicion(resLexer, true, nuevaFnEst, funSiNoEsOp);

                                            } else {
                                                fnEstablecer();
                                                return funDesicion(lexer.sigToken(), false, () => {
                                                }, () => new PReturn());
                                            }

                                        } else {
                                            return expresionRespuesta;
                                        }
                                    } else {
                                        return funValorDefecto();
                                    }
                                }
                                default: {
                                    let _: never;
                                    _ = token;
                                    return _;
                                }
                            }
                        }
                    }
                }

                return funDesicion(lexer.sigToken(), false, () => {
                }, () => new PReturn());
            }
            default: {
                let _: never;
                _ = sigExpr;
                return _;
            }
        }

    }

    function sigExprIdentificador(
        exprIdInfo: ExprIdInfo,
        nivel: number,
        precedencia: number,
        _: any,
        esExprPrincipal: boolean
    ): ExprRes {

        const primeraExprId = exprIdInfo.expr;
        const infoIdInicio = exprIdInfo.infoInicio;
        const infoIdNumLinea = exprIdInfo.infoNumLinea;
        const infoIdPosInicioLinea = exprIdInfo.infoPosInicioLinea;

        function funDesicion(lexerRes: ResLexer, aceptarSoloOperador: boolean, fnEnOp: () => void, funValorDefecto: () => ExprRes): ExprRes {
            switch (lexerRes.type) {
                case "EOFLexer": return new PExito(primeraExprId);
                case "ErrorLexer": return new PErrorLexer(lexerRes.razon);
                case "TokenLexer": {
                    const token = lexerRes.token;
                    switch (token.type) {
                        case "TIdentificador":
                        case "TNumero":
                        case "TTexto":
                        case "TBool":
                        case "TParenAb": {
                            if (!aceptarSoloOperador) {
                                lexer.retroceder();
                                const [precFunApl, asocFunApl] = [14, Asociatividad.Izq];
                                if (precFunApl > precedencia) {
                                    let infoOpFunApl = obtInfoFunAppl(false, infoIdInicio, infoIdNumLinea, infoIdPosInicioLinea);
                                    return sigExprOperador(primeraExprId, infoOpFunApl, nivel, precFunApl, asocFunApl, esExprPrincipal);
                                } else if (precFunApl == precedencia && asocFunApl == Asociatividad.Der) {
                                    let infoOpFunApl = obtInfoFunAppl(false, infoIdInicio, infoIdNumLinea, infoIdPosInicioLinea);
                                    return sigExprOperador(primeraExprId, infoOpFunApl, nivel, precFunApl, asocFunApl, esExprPrincipal);
                                } else {
                                    return new PExito(primeraExprId);
                                }
                            } else {
                                return funValorDefecto();
                            }
                        }
                        case "TOperador": {
                            const infoOp = token.token;
                            fnEnOp();
                            const [precOp, asocOp] = obtInfoOp(infoOp.valor);
                            if (precOp > precedencia) {
                                return sigExprOperador(primeraExprId, infoOp, nivel, precOp, asocOp, esExprPrincipal);
                            } else if (precOp == precedencia && asocOp == Asociatividad.Der) {
                                return sigExprOperador(primeraExprId, infoOp, nivel, precOp, asocOp, esExprPrincipal);
                            } else {
                                lexer.retroceder();
                                return new PExito(primeraExprId);
                            }
                        }
                        case "TNuevaLinea": {
                            if (!aceptarSoloOperador) {
                                lexer.retroceder();
                                let [tokenSig, indentacion, _, fnEstablecer] = lexer.lookAheadSignificativo(true);

                                let expresionRespuesta = new PExito(primeraExprId);
                                if (esExprPrincipal) {
                                    if (indentacion < nivel) {
                                        return expresionRespuesta;
                                    } else if (indentacion == nivel) {
                                        const nuevaFnEst = () => {
                                            fnEstablecer();
                                            lexer.sigToken();
                                        };

                                        const funSiNoEsOp = () => {
                                            let primeraExpresion = expresionRespuesta;
                                            fnEstablecer();
                                            let sigExpresionRaw = sigExpresion(nivel, nivel, false, 0, Asociatividad.Izq, true);
                                            switch (sigExpresionRaw.type) {
                                                case "PError": return new PError(sigExpresionRaw.err);
                                                case "PErrorLexer": return sigExpresionRaw;
                                                case "PReturn":
                                                case "PEOF": return primeraExpresion;
                                                case "PExito": {
                                                    const nuevaExpr = sigExpresionRaw.expr;
                                                    switch (nuevaExpr.type) {
                                                        case "EBloque": {
                                                            const exprs = nuevaExpr.bloque;
                                                            return new PExito(new EBloque([primeraExprId, ...exprs]));
                                                        }
                                                        default: {
                                                            return new PExito(new EBloque([primeraExprId, nuevaExpr]));
                                                        }
                                                    }
                                                }
                                                default:
                                                    let _: never;
                                                    _ = sigExpresionRaw;
                                                    return _;
                                            }
                                        };
                                        return funDesicion(tokenSig, true, nuevaFnEst, funSiNoEsOp);

                                    } else {
                                        fnEstablecer();
                                        return funDesicion(lexer.sigToken(), false, () => {}, () => new PReturn());
                                    }
                                } else {
                                    return expresionRespuesta;
                                }
                            } else {
                                return funValorDefecto();
                            }
                        }
                        case "TComentario": {
                            console.log("Atorado en parser?");
                            return funDesicion(lexer.sigToken(), aceptarSoloOperador, fnEnOp, funValorDefecto);
                        }
                        case "TParenCer": {
                            if (!aceptarSoloOperador) {
                                lexer.retroceder();
                                return new PExito(primeraExprId);
                            } else {
                                return funValorDefecto();
                            }
                        }
                        case "PC_LET": {
                            const info = token.token;
                            const textoError = generarTextoError(info);
                            return new PError(`No se esperaba la palabra clave 'let' luego de la aplicación del operador.\n\n${textoError}`)
                        }
                        case "PC_CONST": {
                            const info = token.token;
                            const textoError = generarTextoError(info);
                            return new PError(`No se esperaba la palabra clave 'const' luego de la aplicación del operador.\n\n${textoError}`)
                        }
                        case "TAgrupAb": {
                            const info = token.token;
                            const textoError = generarTextoError(info);
                            return new PError(`Este signo de agrupación aun no está soportado.\n\n${textoError}`);
                        }
                        case "TAgrupCer": {
                            const info = token.token;
                            const textoError = generarTextoError(info);
                            return new PError(`Este signo de agrupación aun no está soportado.\n\n${textoError}`);
                        }
                        case "TGenerico": {
                            if (!aceptarSoloOperador) {
                                const infoGen = token.token;
                                const textoError = generarTextoError(infoGen);
                                return new PError(`No se esperaba un genérico luego del identificador.\n\n${textoError}`)
                            } else {
                                return funValorDefecto();
                            }
                        }
                        default:
                            let _: never;
                            _ = token;
                            return _;
                    }
                }
            }
        }

        return funDesicion(lexer.sigToken(), false, () => {}, () => new PReturn());
    }

    function sigExprParen(infoParen: InfoToken<string>, _: number, __: number) {
        parensAbiertos = parensAbiertos + 1;
        const sigToken = lexer.sigToken();
        switch (sigToken.type) {
            case "EOFLexer":
                return new PError("Parentesis sin cerrar");
            case "ErrorLexer": {
                return new PError(`Error lexico: ${sigToken.razon}\nParentesis sin cerrar.`);
            }
            case "TokenLexer": {
                const t = sigToken.token;
                switch (t.type) {
                    case "TParenCer": {
                        const infoParenCer = t.token;
                        return new PExito(new EIdentificador(new SignIndefinida(), {
                            ...infoParen,
                            valor: "()",
                            final: infoParenCer.final
                        }));
                    }
                    default: {
                        lexer.retroceder();
                        const sigToken = sigExpresion(0, 0, false, 0, Asociatividad.Izq, true);
                        switch (sigToken.type) {
                            case "PReturn":
                                return new PError("Error de indentación. El parentesis no ha sido cerrado.");
                            case "PErrorLexer":
                                return sigToken;
                            case "PError":
                                return sigToken;
                            case "PEOF": {
                                let textoErr = generarTextoError(infoParen);
                                let numLinea = infoParen.numLinea;
                                let numColumna = infoParen.inicio - infoParen.posInicioLinea;
                                return new PError(`El parentesis abierto en ${numLinea},${numColumna} no está cerrado.\n\n${textoErr}`);
                            }
                            case "PExito": {
                                const sigExpr2 = sigToken.expr;
                                const ultimoToken = lexer.sigToken();
                                switch (ultimoToken.type) {
                                    case "EOFLexer": {
                                        let textoErr = generarTextoError(infoParen);
                                        let numLinea = infoParen.numLinea;
                                        let numColumna = infoParen.inicio - infoParen.posInicioLinea;
                                        return new PError(`El parentesis abierto en ${numLinea},${numColumna} contiene una expresion, pero no está cerrado.\n\n${textoErr}`);
                                    }
                                    case "ErrorLexer": {
                                        const error = ultimoToken.razon;
                                        const textoErr = generarTextoError(infoParen);
                                        const numLinea = infoParen.numLinea;
                                        const numColumna = infoParen.inicio - infoParen.posInicioLinea;
                                        return new PError(`El parentesis abierto en ${numLinea},${numColumna} no está cerrado.\n\n${textoErr}\nDebido a un error léxico: ${error}`);
                                    }
                                    case "TokenLexer": {
                                        const ultimoToken3 = ultimoToken.token;
                                        switch (ultimoToken3.type) {
                                            case "TParenCer": {
                                                parensAbiertos = parensAbiertos - 1;
                                                return new PExito(sigExpr2);
                                            }
                                            default:
                                                return new PError("Se esperaba un cierre de parentesis.")
                                        }
                                    }
                                    default:
                                        let _: never;
                                        _ = ultimoToken;
                                        return _;
                                }
                            }
                            default:
                                let _: never;
                                _ = sigToken;
                                return _;
                        }
                    }
                }
            }
            default:
                let _: never;
                _ = sigToken;
                return _;
        }
    }

    function sigExpresion(
        nivel: number, nivelPadre: number, iniciarIndentacionEnToken: boolean,
        precedencia: number, asociatividad: Asociatividad, esExprPrincipal: boolean
    ): ExprRes {

        const obtNuevoNivel = (infoToken: InfoToken<any>): number => {
            if (iniciarIndentacionEnToken) {
                return infoToken.inicio - infoToken.posInicioLinea;
            } else {
                return nivel;
            }
        };

        const resultado = lexer.sigToken();

        switch (resultado.type) {
            case "EOFLexer": {
                return new PEOF();
            }
            case "ErrorLexer": {
                return new PErrorLexer(resultado.razon);
            }
            case "TokenLexer": {
                const token = resultado.token;
                switch (token.type) {
                    case "PC_LET": {
                        return sigExprDeclaracion(obtNuevoNivel(token.token), true);
                    }
                    case "PC_CONST": {
                        return sigExprDeclaracion(obtNuevoNivel(token.token), false);
                    }
                    case "TComentario":
                        return sigExpresion(nivel, nivel, iniciarIndentacionEnToken, precedencia, asociatividad, esExprPrincipal);
                    case "TNumero": {
                        const infoNumero = token.token;
                        let exprIdInfo: ExprIdInfo = {
                            expr: new ENumero(infoNumero),
                            infoInicio: infoNumero.inicio,
                            infoNumLinea: infoNumero.numLinea,
                            infoPosInicioLinea: infoNumero.posInicioLinea
                        };
                        return sigExprIdentificador(exprIdInfo, obtNuevoNivel(infoNumero), precedencia, asociatividad, esExprPrincipal);
                        // sigExprLiteral(ENumero(infoNumero), obtNuevoNivel(infoNumero), precedencia, esExprPrincipal);
                    }
                    case "TTexto": {
                        const infoTexto = token.token;
                        let exprIdInfo: ExprIdInfo = {
                            expr: new ETexto(infoTexto),
                            infoInicio: infoTexto.inicio,
                            infoNumLinea: infoTexto.numLinea,
                            infoPosInicioLinea: infoTexto.posInicioLinea
                        };
                        return sigExprIdentificador(exprIdInfo, obtNuevoNivel(infoTexto), precedencia, asociatividad, esExprPrincipal);
                        // sigExprLiteral(ETexto(infoTexto), obtNuevoNivel(infoTexto), precedencia, esExprPrincipal);
                    }
                    case "TBool": {
                        const infoBool = token.token;
                        let exprIdInfo: ExprIdInfo = {
                            expr: new EBool(infoBool),
                            infoInicio: infoBool.inicio,
                            infoNumLinea: infoBool.numLinea,
                            infoPosInicioLinea: infoBool.posInicioLinea
                        };
                        return sigExprIdentificador(exprIdInfo, obtNuevoNivel(infoBool), precedencia, asociatividad, esExprPrincipal);
                        // sigExprLiteral(EBool(infoBool), obtNuevoNivel(infoBool), precedencia, esExprPrincipal);
                    }
                    case "TIdentificador": {
                        const infoId = token.token;
                        let exprIdInfo: ExprIdInfo = {
                            expr: new EIdentificador(
                                new SignIndefinida(),
                                infoId
                            ),
                            infoInicio: infoId.inicio,
                            infoNumLinea: infoId.numLinea,
                            infoPosInicioLinea: infoId.posInicioLinea
                        }
                        return sigExprIdentificador(exprIdInfo, obtNuevoNivel(infoId), precedencia, asociatividad, esExprPrincipal);
                    }
                    case "TParenAb": {
                        const infoParen = token.token;
                        return sigExprParen(infoParen, obtNuevoNivel(infoParen), nivelPadre);
                    }
                    case "TParenCer": {
                        const infoParen = token.token;
                        if (parensAbiertos > 0) {
                            lexer.retroceder();
                            return new PReturn();
                        } else {
                            let textoErr = generarTextoError(infoParen);
                            return new PError(`No se esperaba un parentesis aquí. No hay ningún parentesis a cerrar.\n\n${textoErr}`);
                        }
                    }
                    case "TNuevaLinea": {
                        lexer.retroceder();
                        const [_, sigNivel, __, fnEstablecer] = lexer.lookAheadSignificativo(true);
                        if (sigNivel >= nivel) {
                            fnEstablecer();
                            return sigExpresion(nivel, nivel, iniciarIndentacionEnToken, precedencia, asociatividad, esExprPrincipal);
                        } else {
                            return new PReturn();
                        }
                    }
                    case "TAgrupAb":
                    case "TAgrupCer": {
                        return new PError(`Otros signos de agrupación aun no estan soportados.`)
                    }
                    case "TGenerico":
                        return new PError(`Los genericos aun no estan soportados.`);
                    case "TOperador": {
                        const infoOp = token.token;
                        let textoErr = generarTextoError(infoOp);
                        return new PError(`No se puede usar un operador como expresión. Si esa es tu intención, rodea el operador en paréntesis, por ejemplo: (+)\n\n${textoErr}`);
                    }
                }
            }
            default: {
                let _: never;
                _ = resultado;
                return _;
            }
        }

    }

    let exprRe = sigExpresion(0, 0, true, 0, Asociatividad.Izq, true);
    switch (exprRe.type) {
        case "PExito":
            return new ExitoParser(exprRe.expr);
        case "PError":
            return new ErrorParser(exprRe.err);
        case "PErrorLexer":
            return new ErrorLexerP(exprRe.err);
        case "PEOF":
        case "PReturn":
            return new ExitoParser(new EBloque([]));
    }

}
