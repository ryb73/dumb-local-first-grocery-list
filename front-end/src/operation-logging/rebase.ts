/**
 * Transforms a list of operations that have been added locally against a list of
 * operations that have already been applied remotely.
 *
 * This function is the core of the client-side synchronization logic. It takes
 * operations that the client has performed locally and adjusts them as if they
 * were made *after* the operations that have already been applied on the server.
 * This process is essential for resolving conflicts and ensuring that both the
 * client and server converge to the same state.
 *
 * @param localOps - An array of operations that were performed on the client
 *   but have not yet been synchronized with the server.
 * @param remoteOps - An array of operations that were applied on the server
 *   since the last time the client synchronized.
 * @returns An array of "rebased" local operations. These are the transformed
 *   local operations that can now be safely applied on the client (after the
 *   remote operations have been applied) and then sent to the server.
 */
export function rebase<Operation, RebaseContext>(
  localOps: Operation[],
  remoteOps: Operation[],
  resolveConflict: (
    contextOp: Operation,
    localOp: Operation,
    context: RebaseContext
  ) => {
    transformedOps: Operation[];
    newContext: RebaseContext;
  },
  initialContext: RebaseContext
): Operation[] {
  const initialState: {
    rebasedOps: Operation[];
    context: RebaseContext;
  } = {
    rebasedOps: [],
    context: initialContext,
  };

  // One by one, apply each local op against the context ops.
  const finalState = localOps.reduce((localOpIntermediateState, localOp) => {
    const contextOps = [...remoteOps, ...localOpIntermediateState.rebasedOps];

    // Move through the context ops one by one, applying opsToTransform to each.
    const transformResult = contextOps.reduce(
      (contextOpIntermediateState, contextOp) => {
        // For each op to transform, resolve the conflict between it and the context op.
        const { transformedOps, context: newContext } =
          contextOpIntermediateState.opsToTransform.reduce(
            (
              { context, transformedOps: transformedOpsSoFar },
              opToTransform
            ) => {
              const resolution = resolveConflict(
                contextOp,
                opToTransform,
                context
              );
              return {
                transformedOps: [
                  ...transformedOpsSoFar,
                  ...resolution.transformedOps,
                ],
                context: resolution.newContext,
              };
            },
            {
              transformedOps: [] as Operation[],
              context: contextOpIntermediateState.context,
            }
          );

        return {
          opsToTransform: transformedOps,
          context: newContext,
        };
      },
      {
        opsToTransform: [localOp],
        context: localOpIntermediateState.context,
      }
    );

    return {
      rebasedOps: [
        ...localOpIntermediateState.rebasedOps,
        ...transformResult.opsToTransform,
      ],
      context: transformResult.context,
    };
  }, initialState);

  return finalState.rebasedOps;
}
