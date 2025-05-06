exports.handler = async (event) => {
    try {
        const token = event.authorizationToken;
        
        // Add your token validation logic here
        // For now, we'll accept any token that starts with "Bearer "
        if (!token || !token.startsWith('Bearer ')) {
            throw new Error('Invalid token');
        }

        // Generate IAM policy
        const policy = {
            principalId: 'user',
            policyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: 'execute-api:Invoke',
                        Effect: 'Allow',
                        Resource: event.methodArn
                    }
                ]
            }
        };

        return policy;
    } catch (error) {
        console.error('Authorization error:', error);
        throw new Error('Unauthorized');
    }
}; 